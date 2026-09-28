import { describe, expect, it } from 'vitest';
import type { NaverConnectionStatus } from '@blow/naver-adapter';
import { getConnectedBlogId } from './naver-workflow.js';

const connected: NaverConnectionStatus = {
  stage: 'WRITER_LINK_READY',
  message: '블로그 확인 완료',
  registeredBlogId: 'example',
  actualBlogId: 'example',
  currentUrl: 'https://blog.naver.com/example',
};

describe('connection-first writing readiness', () => {
  it('allows writing after the account is checked, before opening an editor', () => {
    expect(getConnectedBlogId(connected, true, false)).toBe('example');
  });
  it('keeps an already verified editor connected', () => {
    expect(getConnectedBlogId({ ...connected, stage: 'WRITER_READY' }, true, false)).toBe('example');
  });
  it.each(['LOGIN_REQUIRED', 'HOME_READY', 'BLOG_MISMATCH'] as const)('blocks unverified stage %s', (stage) => {
    expect(getConnectedBlogId({ ...connected, stage }, true, false)).toBeNull();
  });
  it('rejects closed, missing, and failed connections', () => {
    expect(getConnectedBlogId(connected, false, false)).toBeNull();
    expect(getConnectedBlogId(null, true, false)).toBeNull();
    expect(getConnectedBlogId(connected, true, true)).toBeNull();
  });
  it('never treats a different or missing actual blog as verified', () => {
    expect(getConnectedBlogId({ ...connected, actualBlogId: 'another' }, true, false)).toBeNull();
    const { actualBlogId: _actualBlogId, ...unchecked } = connected;
    expect(getConnectedBlogId(unchecked, true, false)).toBeNull();
  });
});
