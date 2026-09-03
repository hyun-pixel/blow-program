import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { runMockPoc } from '../src/main/mock-poc.js';

const scriptDirectory = dirname(fileURLToPath(import.meta.url));
const projectRoot = resolve(scriptDirectory, '../../..');

try {
  const result = await runMockPoc({
    profilePath: resolve(projectRoot, '.local/mock-chrome-profile'),
    mockEditorPath: resolve(
      projectRoot,
      'apps/desktop/resources/mock-editor.html',
    ),
    headless: true,
    keepBrowserOpen: false,
    onSnapshot: (snapshot) => {
      const latest = snapshot.history.at(-1);
      if (latest) {
        console.log(`[${latest.state}] ${latest.message}`);
      }
    },
  });

  console.log(
    `POC 성공: ${result.verification.savedStatus}`,
  );
} catch (error) {
  const message =
    error instanceof Error
      ? error.message
      : '자동 입력 테스트를 완료하지 못했습니다.';

  console.error(`POC 실패: ${message}`);
  process.exitCode = 1;
}
