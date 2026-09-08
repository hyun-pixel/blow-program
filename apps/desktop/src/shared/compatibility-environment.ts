export interface CompatibilityEnvironmentResult {
  readonly stage: 'COMPATIBILITY_ENVIRONMENT_RECORDED';
  readonly message: string;
  readonly operatingSystem: string;
  readonly chromeVersion: string;
  readonly displayScalePercent: number;
}

export interface WriterNavigationRepeatProgress {
  readonly completedRuns: number;
  readonly totalRuns: number;
}

export interface WriterNavigationRepeatResult
  extends WriterNavigationRepeatProgress {
  readonly stage: 'WRITER_NAVIGATION_REPEAT_CONFIRMED';
  readonly message: string;
  readonly chromeVersion: string;
}

export interface SlowNetworkTestResult {
  readonly stage: 'SLOW_NETWORK_CONFIRMED';
  readonly message: string;
  readonly latencyMs: number;
  readonly delayedNavigationCount: number;
  readonly blogHomeReached: boolean;
  readonly writerReached: boolean;
  readonly chromeVersion: string;
}

export function getWindowsDisplayName(systemVersion: string): string {
  const parts = systemVersion.split('.');
  const major = Number(parts[0]);
  const build = Number(parts[2]);

  if (major === 10 && Number.isFinite(build) && build >= 22_000) {
    return `Windows 11 (${systemVersion})`;
  }

  if (major === 10) {
    return `Windows 10 (${systemVersion})`;
  }

  return `Windows (${systemVersion})`;
}

export function toDisplayScalePercent(scaleFactor: number): number {
  if (!Number.isFinite(scaleFactor) || scaleFactor <= 0) {
    return 100;
  }

  return Math.round(scaleFactor * 100);
}