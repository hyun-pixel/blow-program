import type { Locator, Page } from 'playwright-core';
import { describe, expect, it, vi } from 'vitest';
import {
  NaverImageAdapter,
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
  readonly partialFailure?: boolean;
  readonly useToolbar?: boolean;
}) {
  let insertedCount = 0;
  const input = {
    isEnabled: vi.fn().mockResolvedValue(true),
    setInputFiles: vi.fn(async (files: string | string[]) => {
      if (options?.partialFailure) {
        insertedCount += 1;
        throw new Error('file input was replaced during upload');
      }

      insertedCount += Array.isArray(files) ? files.length : 1;
    }),
  } as unknown as Locator;
  const toolbar = {
    click: vi.fn().mockResolvedValue(undefined),
    isVisible: vi.fn().mockResolvedValue(true),
  } as unknown as Locator;
  const fileChooser = {
    setFiles: vi.fn(async (files: string | string[]) => {
      insertedCount += Array.isArray(files) ? files.length : 1;
    }),
  };
  const emptyCollection = createCollection([]);
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

      if (selector === '.se-component.se-image') {
        return createCollection(
          Array.from({ length: insertedCount }, () => ({} as Locator)),
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

  return { fileChooser, input, page, toolbar };
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

describe('네이버 개별사진 첨부', () => {
  it('선택한 이미지를 한 번에 전달하고 개수를 확인한다', async () => {
    const { input, page } = createImagePage();
    const adapter = new NaverImageAdapter(page);

    const result = await adapter.attachIndividualImages([
      'C:\\images\\one.jpg',
      'C:\\images\\two.png',
    ]);

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

  it('파일 입력이 없으면 확인된 사진 버튼의 파일 선택기를 사용한다', async () => {
    const { fileChooser, page, toolbar } = createImagePage({
      useToolbar: true,
    });
    const adapter = new NaverImageAdapter(page);

    await adapter.attachIndividualImages(['C:\\images\\one.jpg']);

    expect(toolbar.click).toHaveBeenCalledOnce();
    expect(fileChooser.setFiles).toHaveBeenCalledWith([
      'C:\\images\\one.jpg',
    ]);
  });

  it('사진 입력이 여러 개면 임의로 선택하지 않는다', async () => {
    const { page } = createImagePage({ inputCount: 2 });
    const adapter = new NaverImageAdapter(page);

    await expect(
      adapter.attachIndividualImages(['C:\\images\\one.jpg']),
    ).rejects.toMatchObject({ code: 'IMAGE_INPUT_AMBIGUOUS' });
  });

  it('일부만 삽입된 뒤 입력이 끊기면 중복 재시도를 막는다', async () => {
    const { page } = createImagePage({ partialFailure: true });
    const adapter = new NaverImageAdapter(page);

    await expect(
      adapter.attachIndividualImages([
        'C:\\images\\one.jpg',
        'C:\\images\\two.png',
      ]),
    ).rejects.toMatchObject({
      code: 'IMAGE_PARTIAL_UPLOAD',
      message: expect.stringContaining('2장 중 1장'),
    });
  });
});