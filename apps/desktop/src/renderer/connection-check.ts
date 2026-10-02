const timeoutMessage = '연결 확인 시간이 초과되었습니다. 입력 내용은 유지됩니다. 잠시 후 다시 확인해 주세요. [CONNECTION_CHECK_TIMEOUT]';

// Read-only checks only: a timeout must never retry a paid generation or a save.
export async function checkWithTimeout<T>(read: () => PromiseLike<T>): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      Promise.resolve().then(read),
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new Error(timeoutMessage)), 20_000);
      }),
    ]);
  } finally {
    clearTimeout(timer);
  }
}

export function connectionCheckMessage(error: unknown): string {
  // Never display raw IPC/network errors: they may contain credentials or URLs.
  return error instanceof Error && error.message === timeoutMessage ? timeoutMessage
    : '연결 확인 응답을 받지 못했습니다. 입력 내용은 유지됩니다. 다시 확인해 주세요. [CONNECTION_CHECK_FAILED]';
}
