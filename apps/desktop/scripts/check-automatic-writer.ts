import assert from 'node:assert/strict';
import { chromium } from 'playwright-core';
import { NaverConnectionSession } from '../src/main/naver-connection.js';

// Offline integration check: isolated Chrome, synthetic pages, no user account or API.
const browser = await chromium.launch({ channel: 'chrome', headless: true });
const context = await browser.newContext();
const launch = chromium.launchPersistentContext;
try {
  await context.route('**/*', async (route) => {
    const url = new URL(route.request().url());
    if (url.hostname === 'blog.naver.com' && url.pathname === '/MyBlog.naver') {
      await route.fulfill({ status: 302, headers: { location: 'https://blog.naver.com/example' } });
    } else if (url.hostname === 'section.blog.naver.com') {
      await route.fulfill({ contentType: 'text/html; charset=utf-8', body: '<a href="https://blog.naver.com/GoBlogWrite.naver" target="_blank">글쓰기</a>' });
    } else if (url.hostname === 'blog.naver.com' && url.pathname === '/GoBlogWrite.naver') {
      await route.fulfill({ status: 302, headers: { location: 'https://blog.naver.com/example/postwrite' } });
    } else if (url.hostname === 'blog.naver.com' && ['/example', '/example/postwrite'].includes(url.pathname)) {
      await route.fulfill({ contentType: 'text/html', body: '<main>Offline test fixture</main>' });
    } else {
      await route.abort();
    }
  });
  chromium.launchPersistentContext = async () => context;
  const { session } = await NaverConnectionSession.create({
    profilePath: '.', blogUrl: 'https://blog.naver.com/example', headless: true,
  });
  assert.equal((await session.verify()).stage, 'WRITER_LINK_READY');
  const originalPage = context.pages()[0]!;
  const originalUrl = originalPage.url();
  for (let run = 0; run < 2; run += 1) {
    assert.equal((await session.prepareAutomaticWriter('example')).stage, 'WRITER_READY');
    assert.equal(originalPage.isClosed(), false);
    assert.equal(originalPage.url(), originalUrl);
  }
  console.log('PASS: two automatic writers opened on offline pages; original tab preserved; no AI or external requests.');
} finally {
  chromium.launchPersistentContext = launch;
  await browser.close();
}
