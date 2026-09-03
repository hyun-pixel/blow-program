import type {
  Locator,
  Page,
} from 'playwright-core';
import type {
  DraftContent,
  DraftVerification,
  EditorAdapter,
} from './contracts.js';

const saveCompleteText = '임시저장 완료';

async function requireEditable(
  locator: Locator,
  fieldName: string,
): Promise<void> {
  await locator.waitFor({ state: 'visible' });

  if (!(await locator.isEditable())) {
    throw new Error(`${fieldName} 입력 영역이 편집 가능한 상태가 아닙니다.`);
  }
}

async function readContentEditable(locator: Locator): Promise<string> {
  const text = await locator.innerText();

  return text
    .replace(/\r\n/g, '\n')
    .replace(/\u00a0/g, ' ')
    .replace(/\n{2,}/g, '\n\n');
}

export class MockEditorAdapter implements EditorAdapter {
  constructor(private readonly page: Page) {}

  async assertReady(): Promise<void> {
    await this.page.getByTestId('mock-editor').waitFor({
      state: 'visible',
    });

    await requireEditable(
      this.page.getByRole('textbox', { name: '제목' }),
      '제목',
    );
    await requireEditable(
      this.page.getByRole('textbox', { name: '본문' }),
      '본문',
    );
  }

  async enterTitle(title: string): Promise<void> {
    const titleField = this.page.getByRole('textbox', { name: '제목' });

    await titleField.fill(title);

    if ((await titleField.inputValue()) !== title) {
      throw new Error('입력한 제목이 원본과 일치하지 않습니다.');
    }
  }

  async enterBody(paragraphs: readonly string[]): Promise<void> {
    const bodyField = this.page.getByRole('textbox', { name: '본문' });
    const body = paragraphs.join('\n\n');

    await bodyField.fill(body);

    if ((await readContentEditable(bodyField)) !== body) {
      throw new Error('입력한 본문이 원본과 일치하지 않습니다.');
    }
  }

  async verifyContent(expected: DraftContent): Promise<void> {
    const title = await this.page
      .getByRole('textbox', { name: '제목' })
      .inputValue();
    const body = await readContentEditable(
      this.page.getByRole('textbox', { name: '본문' }),
    );

    if (title !== expected.title || body !== expected.paragraphs.join('\n\n')) {
      throw new Error('입력한 제목 또는 본문이 원본과 일치하지 않습니다.');
    }
  }

  async saveDraft(): Promise<void> {
    const saveButton = this.page.getByRole('button', {
      name: '임시저장',
      exact: true,
    });

    await saveButton.waitFor({ state: 'visible' });

    if (!(await saveButton.isEnabled())) {
      throw new Error('임시저장 버튼이 활성화되지 않았습니다.');
    }

    await saveButton.click();
  }

  async verifyDraftSaved(): Promise<DraftVerification> {
    const status = this.page
      .getByRole('status')
      .filter({ hasText: saveCompleteText });

    await status.waitFor({ state: 'visible' });

    return {
      title: await this.page
        .getByRole('textbox', { name: '제목' })
        .inputValue(),
      body: await readContentEditable(
        this.page.getByRole('textbox', { name: '본문' }),
      ),
      savedStatus: await status.innerText(),
    };
  }
}
