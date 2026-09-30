import { describe, expect, it } from 'vitest';
import { assertPublicBuildConfig } from './public-build-config.js';

const valid = { VITE_SUPABASE_URL: 'https://example.supabase.co', VITE_SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_test_only' };
describe('desktop public build configuration', () => {
  it('accepts public connection values', () => {
    expect(() => assertPublicBuildConfig(valid)).not.toThrow();
  });
  it.each(['VITE_SUPABASE_URL', 'VITE_SUPABASE_PUBLISHABLE_KEY'])('blocks a missing or blank %s', (name) => {
    expect(() => assertPublicBuildConfig({ ...valid, [name]: undefined })).toThrow('공개 연결 설정');
    expect(() => assertPublicBuildConfig({ ...valid, [name]: '  ' })).toThrow('공개 연결 설정');
  });
  it.each(['sb_secret_test_only', 'eyJservice_role_test_only', 'unexpected-value'])('rejects non-public keys without exposing their value', (key) => {
    let message = '';
    try { assertPublicBuildConfig({ ...valid, VITE_SUPABASE_PUBLISHABLE_KEY: key }); } catch (error) { message = (error as Error).message; }
    expect(message).toContain('빌드 중단');
    expect(message).not.toContain(key);
  });
  it.each(['not-a-url', 'http://example.supabase.co', 'https://user:password@example.supabase.co', 'https://example.supabase.co?token=test'])('rejects unsafe URL values', (url) => {
    expect(() => assertPublicBuildConfig({ ...valid, VITE_SUPABASE_URL: url })).toThrow('HTTPS 주소');
  });
});
