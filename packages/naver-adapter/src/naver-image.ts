import { extname } from 'node:path';
import type { Locator, Page } from 'playwright-core';

const IMAGE_UPLOAD_TIMEOUT_MS = 30_000;
const IMAGE_LAYOUT_TIMEOUT_MS = 15_000;
const IMAGE_UPLOAD_POLL_MS = 250;

const imageInputSelectors = [
  'input[type="file"][accept*="image"]',
  'input[type="file"][accept*=".jpg"]',
  'input[type="file"][accept*=".jpeg"]',
  'input[type="file"][accept*=".png"]',
] as const;

const imageToolbarSelectors = [
  'button.se-image-toolbar-button',
  '.se-toolbar-item-image button',
  'button[aria-label="사진"]',
  'button[title="사진"]',
  'button[aria-label="이미지"]',
  'button[title="이미지"]',
] as const;

const imageComponentSelectors = [
  '.se-component.se-image',
  '.se-component-image',
  '[data-comp="image"]',
] as const;

const layoutControlSelectors = [
  'button',
  '[role="button"]',
  '[role="radio"]',
  'label',
] as const;

const groupedImageSelectors = {
  collage: [
    '.se-component.se-imageGroup.se-l-collage',
    '.se-component.se-imageGroup:not(.se-l-slide)',
    '.se-component.se-image-group.se-l-collage',
    '[data-comp="imageGroup"]:not([class*="slide"])',
  ],
  slide: [
    '.se-component.se-imageGroup.se-l-slide',
    '.se-component.se-image-group.se-l-slide',
    '[data-comp="imageGroup"][class*="slide"]',
  ],
} as const;

const imageLayoutLabels = {
  individual: '개별 사진',
  collage: '콜라주',
  slide: '슬라이드',
} as const;

const imageLayoutControlLabels = {
  individual: ['개별사진', '개별 사진'],
  collage: ['콜라주'],
  slide: ['슬라이드'],
} as const;

export type NaverImageLayout = keyof typeof imageLayoutLabels;

export type NaverImageFailureCode =
  | 'INVALID_IMAGE_SELECTION'
  | 'IMAGE_INPUT_NOT_FOUND'
  | 'IMAGE_INPUT_AMBIGUOUS'
  | 'IMAGE_UPLOAD_FAILED'
  | 'IMAGE_PARTIAL_UPLOAD'
  | 'IMAGE_COUNT_MISMATCH'
  | 'IMAGE_LAYOUT_CONTROL_NOT_FOUND'
  | 'IMAGE_LAYOUT_CONTROL_AMBIGUOUS'
  | 'IMAGE_LAYOUT_MISMATCH';

export interface NaverSelectedImageFile {
  readonly id: string;
  readonly name: string;
  readonly sizeBytes: number;
}

export interface NaverImageAttachmentResult {
  readonly stage: 'IMAGES_VERIFIED';
  readonly message: string;
  readonly currentUrl: string;
  readonly requestedCount: number;
  readonly insertedCount: number;
  readonly layout: NaverImageLayout;
}

export class NaverImageError extends Error {
  constructor(
    readonly code: NaverImageFailureCode,
    message: string,
    options?: ErrorOptions,
  ) {
    super(message, options);
    this.name = 'NaverImageError';
  }
}

export function validateImagePaths(
  imagePaths: readonly string[],
): readonly string[] {
  if (imagePaths.length === 0) {
    throw new NaverImageError(
      'INVALID_IMAGE_SELECTION',
      '첨부할 JPG 또는 PNG 이미지를 선택해 주세요.',
    );
  }

  const normalized = imagePaths.map((imagePath) => imagePath.trim());

  if (
    normalized.some((imagePath) => {
      const extension = extname(imagePath).toLowerCase();
      return !imagePath || !['.jpg', '.jpeg', '.png'].includes(extension);
    })
  ) {
    throw new NaverImageError(
      'INVALID_IMAGE_SELECTION',
      '이번 단계에서는 JPG와 PNG 이미지만 첨부할 수 있습니다.',
    );
  }

  return normalized;
}

function validateLayoutImageCount(
  layout: NaverImageLayout,
  imageCount: number,
): void {
  if (layout !== 'individual' && imageCount < 2) {
    throw new NaverImageError(
      'INVALID_IMAGE_SELECTION',
      `${imageLayoutLabels[layout]}는 이미지를 2장 이상 선택해야 합니다.`,
    );
  }
}

async function findUniqueControl(
  page: Page,
  selectors: readonly string[],
  visibleOnly: boolean,
): Promise<Locator | null> {
  for (const selector of selectors) {
    const candidates: Locator[] = [];

    for (const frame of page.frames()) {
      const matches = frame.locator(selector);
      const count = await matches.count();

      for (let index = 0; index < count; index += 1) {
        const candidate = matches.nth(index);
        const usable = visibleOnly
          ? await candidate.isVisible().catch(() => false)
          : await candidate.isEnabled().catch(() => false);

        if (usable) {
          candidates.push(candidate);
        }
      }
    }

    if (candidates.length > 1) {
      throw new NaverImageError(
        'IMAGE_INPUT_AMBIGUOUS',
        '사진 첨부 버튼이 여러 개 확인되어 안전을 위해 작업을 멈췄습니다.',
      );
    }

    if (candidates.length === 1) {
      return candidates[0]!;
    }
  }

  return null;
}

async function countInsertedImages(page: Page): Promise<number> {
  for (const selector of imageComponentSelectors) {
    let count = 0;

    for (const frame of page.frames()) {
      count += await frame.locator(selector).count();
    }

    if (count > 0) {
      return count;
    }
  }

  return 0;
}

interface GroupedLayoutSnapshot {
  readonly componentCount: number;
  readonly imageCount: number;
}

async function readGroupedLayoutSnapshot(
  page: Page,
  layout: Exclude<NaverImageLayout, 'individual'>,
): Promise<GroupedLayoutSnapshot> {
  for (const selector of groupedImageSelectors[layout]) {
    let componentCount = 0;
    let imageCount = 0;

    for (const frame of page.frames()) {
      const components = frame.locator(selector);
      const count = await components.count();
      componentCount += count;

      for (let index = 0; index < count; index += 1) {
        imageCount += await components.nth(index).locator('img').count();
      }
    }

    if (componentCount > 0) {
      return { componentCount, imageCount };
    }
  }

  return { componentCount: 0, imageCount: 0 };
}

async function uploadImages(
  page: Page,
  imagePaths: readonly string[],
): Promise<void> {
  const input = await findUniqueControl(page, imageInputSelectors, false);

  if (input) {
    await input.setInputFiles([...imagePaths]);
    return;
  }

  const toolbarButton = await findUniqueControl(
    page,
    imageToolbarSelectors,
    true,
  );

  if (!toolbarButton) {
    throw new NaverImageError(
      'IMAGE_INPUT_NOT_FOUND',
      '네이버 편집기의 사진 첨부 버튼을 확인하지 못했습니다.',
    );
  }

  const [fileChooser] = await Promise.all([
    page.waitForEvent('filechooser', { timeout: 5_000 }),
    toolbarButton.click(),
  ]);
  await fileChooser.setFiles([...imagePaths]);
}

async function findLayoutControlOnce(
  page: Page,
  layout: NaverImageLayout,
): Promise<Locator | null> {
  const expectedLabels = imageLayoutControlLabels[layout].map((label) =>
    label.replace(/\s+/g, ''),
  );

  for (const selector of layoutControlSelectors) {
    const candidates: Locator[] = [];

    for (const frame of page.frames()) {
      const matches = frame.locator(selector);
      const count = await matches.count();

      for (let index = 0; index < count; index += 1) {
        const candidate = matches.nth(index);
        const [visible, label] = await Promise.all([
          candidate.isVisible().catch(() => false),
          candidate.innerText().catch(() => ''),
        ]);

        const normalizedLabel = label.replace(/\s+/g, '');

        if (
          visible &&
          expectedLabels.some(
            (expectedLabel) => expectedLabel === normalizedLabel,
          )
        ) {
          candidates.push(candidate);
        }
      }
    }

    if (candidates.length > 1) {
      throw new NaverImageError(
        'IMAGE_LAYOUT_CONTROL_AMBIGUOUS',
        `${imageLayoutLabels[layout]} 선택 버튼이 여러 개 확인되어 안전을 위해 작업을 멈췄습니다.`,
      );
    }

    if (candidates.length === 1) {
      return candidates[0]!;
    }
  }

  return null;
}

async function waitForLayoutControl(
  page: Page,
  layout: NaverImageLayout,
): Promise<Locator> {
  const deadline = Date.now() + IMAGE_LAYOUT_TIMEOUT_MS;

  while (Date.now() < deadline) {
    const control = await findLayoutControlOnce(page, layout);

    if (control) {
      return control;
    }

    await page.waitForTimeout(IMAGE_UPLOAD_POLL_MS);
  }

  throw new NaverImageError(
    'IMAGE_LAYOUT_CONTROL_NOT_FOUND',
    `이미지는 첨부됐지만 ${imageLayoutLabels[layout]} 선택 버튼을 확인하지 못했습니다. 중복 입력을 막기 위해 빈 새 글에서 다시 시작해 주세요.`,
  );
}

async function waitForIndividualControlOrInsertion(
  page: Page,
  expectedImageCount: number,
): Promise<Locator | null> {
  const deadline = Date.now() + IMAGE_LAYOUT_TIMEOUT_MS;

  while (Date.now() < deadline) {
    if (await countInsertedImages(page) >= expectedImageCount) {
      return null;
    }

    const control = await findLayoutControlOnce(page, 'individual');

    if (control) {
      return control;
    }

    await page.waitForTimeout(IMAGE_UPLOAD_POLL_MS);
  }

  throw new NaverImageError(
    'IMAGE_LAYOUT_CONTROL_NOT_FOUND',
    '이미지는 첨부됐지만 개별 사진 선택 버튼을 확인하지 못했습니다. 중복 입력을 막기 위해 빈 새 글에서 다시 시작해 주세요.',
  );
}

async function waitForImageCount(
  page: Page,
  expectedCount: number,
): Promise<number> {
  const deadline = Date.now() + IMAGE_UPLOAD_TIMEOUT_MS;
  let actualCount = await countInsertedImages(page);

  while (actualCount < expectedCount && Date.now() < deadline) {
    await page.waitForTimeout(IMAGE_UPLOAD_POLL_MS);
    actualCount = await countInsertedImages(page);
  }

  return actualCount;
}

async function waitForGroupedLayout(
  page: Page,
  layout: Exclude<NaverImageLayout, 'individual'>,
  expectedComponentCount: number,
  expectedImageCount: number,
): Promise<GroupedLayoutSnapshot> {
  const deadline = Date.now() + IMAGE_UPLOAD_TIMEOUT_MS;
  let snapshot = await readGroupedLayoutSnapshot(page, layout);

  while (
    (snapshot.componentCount < expectedComponentCount ||
      snapshot.imageCount < expectedImageCount) &&
    Date.now() < deadline
  ) {
    await page.waitForTimeout(IMAGE_UPLOAD_POLL_MS);
    snapshot = await readGroupedLayoutSnapshot(page, layout);
  }

  return snapshot;
}

export class NaverImageAdapter {
  constructor(private readonly page: Page) {}

  async attachImages(
    inputPaths: readonly string[],
    layout: NaverImageLayout,
  ): Promise<NaverImageAttachmentResult> {
    const imagePaths = validateImagePaths(inputPaths);
    validateLayoutImageCount(layout, imagePaths.length);

    if (layout === 'individual') {
      return this.attachIndividualImages(imagePaths);
    }

    return this.attachGroupedImages(imagePaths, layout);
  }

  async attachIndividualImages(
    inputPaths: readonly string[],
  ): Promise<NaverImageAttachmentResult> {
    const imagePaths = validateImagePaths(inputPaths);
    const initialCount = await countInsertedImages(this.page);

    try {
      await uploadImages(this.page, imagePaths);

      if (imagePaths.length > 1) {
        const layoutControl = await waitForIndividualControlOrInsertion(
          this.page,
          initialCount + imagePaths.length,
        );

        if (layoutControl) {
          await layoutControl.click();
        }
      }

      const actualCount = await waitForImageCount(
        this.page,
        initialCount + imagePaths.length,
      );
      const insertedCount = Math.max(0, actualCount - initialCount);

      if (insertedCount !== imagePaths.length) {
        if (insertedCount > 0) {
          throw new NaverImageError(
            'IMAGE_PARTIAL_UPLOAD',
            `${imagePaths.length}장 중 ${insertedCount}장만 첨부됐습니다. 중복 입력을 막기 위해 빈 새 글에서 다시 시작해 주세요.`,
          );
        }

        throw new NaverImageError(
          'IMAGE_COUNT_MISMATCH',
          '선택한 이미지가 네이버 편집기에 삽입됐는지 확인하지 못했습니다.',
        );
      }

      return {
        stage: 'IMAGES_VERIFIED',
        message: '선택한 이미지를 개별 사진으로 첨부하고 삽입 개수를 확인했습니다.',
        currentUrl: this.page.url(),
        requestedCount: imagePaths.length,
        insertedCount,
        layout: 'individual',
      };
    } catch (error) {
      if (error instanceof NaverImageError) {
        throw error;
      }

      await this.page.waitForTimeout(1_000).catch(() => undefined);
      const currentCount = await countInsertedImages(this.page).catch(
        () => initialCount,
      );
      const insertedCount = Math.max(0, currentCount - initialCount);

      if (insertedCount > 0) {
        throw new NaverImageError(
          'IMAGE_PARTIAL_UPLOAD',
          `${imagePaths.length}장 중 ${insertedCount}장만 첨부됐습니다. 중복 입력을 막기 위해 빈 새 글에서 다시 시작해 주세요.`,
          { cause: error },
        );
      }

      throw new NaverImageError(
        'IMAGE_UPLOAD_FAILED',
        '이미지 첨부를 완료하지 못했습니다. 네이버 편집기 화면을 확인해 주세요.',
        { cause: error },
      );
    }
  }

  private async attachGroupedImages(
    imagePaths: readonly string[],
    layout: Exclude<NaverImageLayout, 'individual'>,
  ): Promise<NaverImageAttachmentResult> {
    const initialGroup = await readGroupedLayoutSnapshot(this.page, layout);
    const initialIndividualCount = await countInsertedImages(this.page);

    try {
      await uploadImages(this.page, imagePaths);
      const layoutControl = await waitForLayoutControl(this.page, layout);
      await layoutControl.click();

      const actualGroup = await waitForGroupedLayout(
        this.page,
        layout,
        initialGroup.componentCount + 1,
        initialGroup.imageCount + imagePaths.length,
      );
      const insertedComponentCount =
        actualGroup.componentCount - initialGroup.componentCount;
      const insertedCount = actualGroup.imageCount - initialGroup.imageCount;

      if (insertedComponentCount !== 1 || insertedCount !== imagePaths.length) {
        throw new NaverImageError(
          'IMAGE_LAYOUT_MISMATCH',
          `${imageLayoutLabels[layout]} 배치와 이미지 ${imagePaths.length}장을 모두 확인하지 못했습니다. 중복 입력을 막기 위해 빈 새 글에서 다시 시작해 주세요.`,
        );
      }

      return {
        stage: 'IMAGES_VERIFIED',
        message: `선택한 이미지를 ${imageLayoutLabels[layout]}로 첨부하고 배치와 삽입 개수를 확인했습니다.`,
        currentUrl: this.page.url(),
        requestedCount: imagePaths.length,
        insertedCount,
        layout,
      };
    } catch (error) {
      if (error instanceof NaverImageError) {
        throw error;
      }

      await this.page.waitForTimeout(1_000).catch(() => undefined);
      const [currentGroup, currentIndividualCount] = await Promise.all([
        readGroupedLayoutSnapshot(this.page, layout).catch(() => initialGroup),
        countInsertedImages(this.page).catch(() => initialIndividualCount),
      ]);

      if (
        currentGroup.componentCount > initialGroup.componentCount ||
        currentIndividualCount > initialIndividualCount
      ) {
        throw new NaverImageError(
          'IMAGE_LAYOUT_MISMATCH',
          `이미지는 첨부됐지만 ${imageLayoutLabels[layout]} 배치를 끝까지 확인하지 못했습니다. 중복 입력을 막기 위해 빈 새 글에서 다시 시작해 주세요.`,
          { cause: error },
        );
      }

      throw new NaverImageError(
        'IMAGE_UPLOAD_FAILED',
        '이미지 첨부를 완료하지 못했습니다. 네이버 편집기 화면을 확인해 주세요.',
        { cause: error },
      );
    }
  }
}