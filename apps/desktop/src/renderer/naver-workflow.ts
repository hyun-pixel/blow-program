import type { NaverConnectionStatus } from '@blow/naver-adapter';

// A remembered URL alone is never proof of a connected account.
export function getConnectedBlogId(
  status: NaverConnectionStatus | null,
  browserOpen: boolean,
  hasError: boolean,
): string | null {
  if (!browserOpen || hasError || !status) return null;
  if (status.stage !== 'WRITER_LINK_READY' && status.stage !== 'WRITER_READY') return null;
  return status.actualBlogId && status.actualBlogId === status.registeredBlogId
    ? status.actualBlogId
    : null;
}
