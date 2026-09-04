import { extname } from 'node:path';
import type { Locator, Page } from 'playwright-core';

const IMAGE_UPLOAD_TIMEOUT_MS = 30_000;
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

export type NaverImageFailureCode =
  | 'INVALID_IMAGE_SELECTION'
  | 'IMAGE_INPUT_NOT_FOUND'
  | 'IMAGE_INPUT_AMBIGUOUS'
  | 'IMAGE_UPLOAD_FAILED'
  | 'IMAGE_PARTIAL_UPLOAD'
  | 'IMAGE_COUNT_MISMATCH';

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
  readonly layout: 'individual';
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

export class NaverImageAdapter {
  constructor(private readonly page: Page) {}

  async attachIndividualImages(
    inputPaths: readonly string[],
  ): Promise<NaverImageAttachmentResult> {
    const imagePaths = validateImagePaths(inputPaths);

    const initialCount = await countInsertedImages(this.page);

    try {
      await uploadImages(this.page, imagePaths);
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
        message: '선택한 이미지를 개별사진으로 첨부하고 삽입 개수를 확인했습니다.',
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
}