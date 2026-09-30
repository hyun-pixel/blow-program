export function assertPublicBuildConfig(env: Record<string, string | undefined>): void {
  const url = env.VITE_SUPABASE_URL?.trim();
  const key = env.VITE_SUPABASE_PUBLISHABLE_KEY?.trim();
  if (!url || !key) {
    throw new Error('빌드 중단: Supabase 공개 연결 설정이 없습니다. apps/desktop/.env.local의 VITE_SUPABASE_URL과 VITE_SUPABASE_PUBLISHABLE_KEY를 확인하세요.');
  }
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== 'https:' || parsed.username || parsed.password || parsed.search || parsed.hash) throw new Error();
  } catch {
    throw new Error('빌드 중단: Supabase URL은 인증정보가 없는 HTTPS 주소여야 합니다.');
  }
  if (!/^sb_publishable_[A-Za-z0-9_-]+$/u.test(key)) {
    throw new Error('빌드 중단: 배포용 앱에는 sb_publishable_ 공개 키만 사용할 수 있습니다. 비밀 키나 service_role 키를 넣지 마세요.');
  }
}
