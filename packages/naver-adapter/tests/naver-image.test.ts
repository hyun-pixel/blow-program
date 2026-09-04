import type { Locator, Page } from 'playwright-core';
import { describe, expect, it, vi } from 'vitest';
import {
  NaverImageAdapter,
  type NaverImageLayout,
  validateImagePaths,
} from '../src/naver-image.js';

function createCollection(locators: readonly Locator[]) {
  return {
    count: vi.fn().mockResolvedValue(locators.length),
    nth: vi.fn((index: number) => locators[index]),
  };
}

function createImagePage(options?: {
  readonly inputCount?: number;
  readonly layout?: NaverImageLayout;
  readonly layoutControlCount?: number;
  readonly partialFailure?: boolean;
  readonly useToolbar?: boolean;
}) {
  let insertedIndividualCount = 0;
  let groupedComponentCount = 0;
  let groupedImageCount = 0;
  let pendingImageCount = 0;
  const applySelectedFiles = async (files: string | string[]) => {
    const fileCount = Array.isArray(files) ? files.length : 1;

    if (options?.partialFailure) {
      insertedIndividualCount += 1;
      throw new Error('file input was replaced during upload');
    }

    if (options?.layout) {
      pendingImageCount = fileCount;
      return;
    }

    insertedIndividualCount += fileCount;
  };
  const input = {
    isEnabled: vi.fn().mockResolvedValue(true),
    setInputFiles: vi.fn(applySelectedFiles),
  } as unknown as Locator;
  const toolbar = {
    click: vi.fn().mockResolvedValue(undefined),
    isVisible: vi.fn().mockResolvedValue(true),
  } as unknown as Locator;
  const fileChooser = {
    setFiles: vi.fn(applySelectedFiles),
  };
  const layoutLabel = options?.layout === 'individual'
    ? '개별사진'
    : options?.layout === 'collage'
      ? '콜라주'
      : '슬라이드';
  const layoutControl = {
    click: vi.fn(async () => {
      if (options?.layout === 'individual') {
        insertedIndividualCount = pendingImageCount;
        return;
      }

      groupedComponentCount = 1;
      groupedImageCount = pendingImageCount;
    }),
    innerText: vi.fn().mockResolvedValue(layoutLabel),
    isVisible: vi.fn().mockResolvedValue(true),
  } as unknown as Locator;
  const emptyCollection = createCollection([]);
  const groupedComponent = {
    locator: vi.fn((selector: string) => (
      selector === 'img'
        ? createCollection(
            Array.from({ length: groupedImageCount }, () => ({} as Locator)),
          )
        : emptyCollection
    )),
  } as unknown as Locator;
  const frame = {
    locator: vi.fn((selector: string) => {
      if (selector.startsWith('input[type="file"]')) {
        return createCollection(
          options?.useToolbar
            ? []
            : Array.from(
                { length: options?.inputCount ?? 1 },
                () => input,
              ),
        );
      }

      if (selector === 'button.se-image-toolbar-button') {
        return createCollection(options?.useToolbar ? [toolbar] : []);
      }

      if (selector === 'button' && options?.layout) {
        return createCollection(
          Array.from(
            { length: options.layoutControlCount ?? 1 },
            () => layoutControl,
          ),
        );
      }

      if (selector === '.se-component.se-image') {
        return createCollection(
          Array.from(
            { length: insertedIndividualCount },
            () => ({} as Locator),
          ),
        );
      }

      if (
        options?.layout &&
        selector === `.se-component.se-imageGroup.se-l-${options.layout}`
      ) {
        return createCollection(
          Array.from(
            { length: groupedComponentCount },
            () => groupedComponent,
          ),
        );
      }

      return emptyCollection;
    }),
  };
  const page = {
    frames: vi.fn().mockReturnValue([frame]),
    url: vi.fn().mockReturnValue(
      'https://blog.naver.com/green_fork?Redirect=Write&categoryNo=1',
    ),
    waitForEvent: vi.fn().mockResolvedValue(fileChooser),
    waitForTimeout: vi.fn().mockResolvedValue(undefined),
  } as unknown as Page;

  return { fileChooser, input, layoutControl, page, toolbar };
}

describe('네이버 이미지 선택 검사', () => {
  it('JPG와 PNG 경로만 허용한다', () => {
    expect(
      validateImagePaths([
        ' C:\\images\\one.JPG ',
        'C:\\images\\two.png',
      ]),
    ).toEqual(['C:\\images\\one.JPG', 'C:\\images\\two.png']);

    expect(() => validateImagePaths([])).toThrowError(
      expect.objectContaining({ code: 'INVALID_IMAGE_SELECTION' }),
    );
    expect(() => validateImagePaths(['C:\\images\\one.webp'])).toThrowError(
      expect.objectContaining({ code: 'INVALID_IMAGE_SELECTION' }),
    );
  });
});

describe('네이버 사진 배치 첨부', () => {
  it('개별 사진은 선택한 이미지를 한 번에 전달하고 개수를 확인한다', async () => {
    const { input, page } = createImagePage();
    const adapter = new NaverImageAdapter(page);

    const result = await adapter.attachImages(
      ['C:\\images\\one.jpg', 'C:\\images\\two.png'],
      'individual',
    );

    expect(input.setInputFiles).toHaveBeenCalledOnce();
    expect(input.setInputFiles).toHaveBeenCalledWith([
      'C:\\images\\one.jpg',
      'C:\\images\\two.png',
    ]);
    expect(result).toMatchObject({
      stage: 'IMAGES_VERIFIED',
      requestedCount: 2,
      insertedCount: 2,
      layout: 'individual',
    });
  });

  it('여러 장의 개별 사진은 네이버 개별사진 버튼을 명시적으로 선택한다', async () => {
    const { input, layoutControl, page } = createImagePage({
      layout: 'individual',
    });
    const adapter = new NaverImageAdapter(page);

    const result = await adapter.attachImages(
      ['C:\images\one.jpg', 'C:\images\two.png'],
      'individual',
    );

    expect(input.setInputFiles).toHaveBeenCalledWith([
      'C:\images\one.jpg',
      'C:\images\two.png',
    ]);
    expect(layoutControl.click).toHaveBeenCalledOnce();
    expect(result).toMatchObject({
      requestedCount: 2,
      insertedCount: 2,
      layout: 'individual',
    });
  });

  it.each([
    ['collage', '콜라주'],
    ['slide', '슬라이드'],
  ] as const)('%s 배치 버튼을 클릭하고 그룹 안의 이미지 수를 확인한다', async (layout) => {
    const { input, layoutControl, page } = createImagePage({ layout });
    const adapter = new NaverImageAdapter(page);

    const result = await adapter.attachImages(
      ['C:\\images\\one.jpg', 'C:\\images\\two.png'],
      layout,
    );

    expect(input.setInputFiles).toHaveBeenCalledWith([
      'C:\\images\\one.jpg',
      'C:\\images\\two.png',
    ]);
    expect(layoutControl.click).toHaveBeenCalledOnce();
    expect(result).toMatchObject({
      requestedCount: 2,
      insertedCount: 2,
      layout,
    });
  });

  it('콜라주와 슬라이드는 이미지를 2장 이상 요구한다', async () => {
    const { page } = createImagePage({ layout: 'collage' });
    const adapter = new NaverImageAdapter(page);

    await expect(
      adapter.attachImages(['C:\\images\\one.jpg'], 'collage'),
    ).rejects.toMatchObject({
      code: 'INVALID_IMAGE_SELECTION',
      message: expect.stringContaining('2장 이상'),
    });
  });

  it('배치 버튼이 여러 개면 임의로 선택하지 않는다', async () => {
    const { page } = createImagePage({
      layout: 'collage',
      layoutControlCount: 2,
    });
    const adapter = new NaverImageAdapter(page);

    await expect(
      adapter.attachImages(
        ['C:\\images\\one.jpg', 'C:\\images\\two.png'],
        'collage',
      ),
    ).rejects.toMatchObject({ code: 'IMAGE_LAYOUT_CONTROL_AMBIGUOUS' });
  });

  it('파일 입력이 없으면 확인된 사진 버튼의 파일 선택기를 사용한다', async () => {
    const { fileChooser, page, toolbar } = createImagePage({
      useToolbar: true,
    });
    const adapter = new NaverImageAdapter(page);

    await adapter.attachImages(['C:\\images\\one.jpg'], 'individual');

    expect(toolbar.click).toHaveBeenCalledOnce();
    expect(fileChooser.setFiles).toHaveBeenCalledWith([
      'C:\\images\\one.jpg',
    ]);
  });

  it('사진 입력이 여러 개면 임의로 선택하지 않는다', async () => {
    const { page } = createImagePage({ inputCount: 2 });
    const adapter = new NaverImageAdapter(page);

    await expect(
      adapter.attachImages(['C:\\images\\one.jpg'], 'individual'),
    ).rejects.toMatchObject({ code: 'IMAGE_INPUT_AMBIGUOUS' });
  });

  it('일부만 삽입된 뒤 입력이 끊기면 중복 재시도를 막는다', async () => {
    const { page } = createImagePage({ partialFailure: true });
    const adapter = new NaverImageAdapter(page);

    await expect(
      adapter.attachImages(
        ['C:\\images\\one.jpg', 'C:\\images\\two.png'],
        'individual',
      ),
    ).rejects.toMatchObject({
      code: 'IMAGE_PARTIAL_UPLOAD',
      message: expect.stringContaining('2장 중 1장'),
    });
  });
});