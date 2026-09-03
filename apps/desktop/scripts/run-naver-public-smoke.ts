import {
  mkdtemp,
  rm,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import {
  join,
  resolve,
} from 'node:path';
import { NaverConnectionSession } from '../src/main/naver-connection.js';

const temporaryRoot = resolve(tmpdir());
const profilePath = await mkdtemp(
  join(temporaryRoot, 'blow-naver-public-'),
);

if (!resolve(profilePath).startsWith(temporaryRoot)) {
  throw new Error('임시 Chrome 프로필 경로가 올바르지 않습니다.');
}

try {
  const { session, status } = await NaverConnectionSession.create({
    profilePath,
    blogUrl: 'https://blog.naver.com/blogpeople',
    headless: true,
  });

  try {
    if (status.stage !== 'LOGIN_REQUIRED') {
      throw new Error(
        `비로그인 공개 확인 결과가 예상과 다릅니다: ${status.stage}`,
      );
    }

    console.log('네이버 공개 연결 확인 성공: 로그인 필요 상태를 안전하게 감지했습니다.');
  } finally {
    await session.close();
  }
} finally {
  await rm(profilePath, {
    recursive: true,
    force: true,
  });
}
