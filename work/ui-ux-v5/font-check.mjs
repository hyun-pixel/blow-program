import { chromium } from 'playwright-core';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const browser = await chromium.launch({channel:'chrome',headless:true});
const page = await browser.newPage({viewport:{width:1366,height:900},reducedMotion:'reduce'});
const failures=[],results=[];
page.on('pageerror',error=>failures.push(String(error)));
await page.route('**/*',route=>{
  const url=new URL(route.request().url());
  if(['127.0.0.1','localhost'].includes(url.hostname)||['data:','blob:'].includes(url.protocol))return route.continue();
  failures.push('Unexpected network request: '+url.origin);return route.abort();
});
const family='Cafe24 Supermagic';
const check=async(name,run)=>{await run();results.push(name);console.log('PASS '+name);};
const nav=name=>page.locator('.sidebar').getByRole('button',{name,exact:true});
const checkFonts=async()=>{
  await page.evaluate(()=>document.fonts.ready);
  assert.equal(await page.evaluate(()=>Array.from(document.fonts).some(face=>face.family==='Cafe24 Supermagic' && face.status==='loaded')),true,'Bundled font must load without relying on an installed system font');
  assert.equal(await page.evaluate(()=>document.fonts.check('16px "Cafe24 Supermagic"','블로그 글 작성')),true);
  const other=await page.evaluate(expected=>Array.from(document.querySelectorAll('h1,h2,h3,p,label,input,select,textarea,button,a,code,pre,small,summary,span,strong,td,th'))
    .filter(el=>el.getClientRects().length && (el.textContent?.trim() || ['INPUT','TEXTAREA','SELECT'].includes(el.tagName)))
    .filter(el=>!getComputedStyle(el).fontFamily.startsWith('"'+expected+'"'))
    .map(el=>({tag:el.tagName,text:el.textContent?.slice(0,40),font:getComputedStyle(el).fontFamily})),family);
  assert.deepEqual(other,[]);
};
const noOverflow=async()=>assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));
try {
  await page.goto('http://127.0.0.1:4180/preview.html?state=ready');
  await check('Brand settings labels, inputs, buttons and headings use the requested font',checkFonts);
  await check('Korean headings really render with the embedded custom font',async()=>{
    const session=await page.context().newCDPSession(page);
    await session.send('DOM.enable');await session.send('CSS.enable');
    const {root}=await session.send('DOM.getDocument');
    const {nodeId}=await session.send('DOM.querySelector',{nodeId:root.nodeId,selector:'.page-head h1'});
    const {fonts}=await session.send('CSS.getPlatformFontsForNode',{nodeId});
    assert.ok(fonts.some(font=>font.isCustomFont && font.familyName.includes('Supermagic') && font.glyphCount>0),JSON.stringify(fonts));
    await session.detach();
    await page.screenshot({path:'work/ui-ux-v5/font-brand-desktop.png'});
  });
  await page.locator('#naver-blog-url').fill('https://blog.naver.com/example');
  await page.getByRole('button',{name:'전용 Chrome 열기',exact:true}).click();
  await page.getByRole('button',{name:'연결됐어요, 새 글 작성',exact:true}).click();
  await check('Composer and writing queue inherit the same font',async()=>{
    await checkFonts();
    await page.locator('#new-post-model').selectOption('gpt-5.6-terra');
    await checkFonts();
    await page.screenshot({path:'work/ui-ux-v5/font-compose-desktop.png'});
  });
  await check('History and guide use the same font',async()=>{
    await nav('작업 내역').click();await checkFonts();
    await nav('사용 가이드').click();await checkFonts();
  });
  await check('375px, landscape and 200% text size preserve layout',async()=>{
    await nav('블로그 세팅').click();
    await page.setViewportSize({width:375,height:812});await noOverflow();
    await page.screenshot({path:'work/ui-ux-v5/font-brand-mobile.png'});
    await page.setViewportSize({width:844,height:390});await noOverflow();
    await page.setViewportSize({width:1366,height:900});
    await page.evaluate(()=>document.documentElement.style.fontSize='200%');
    await noOverflow();await checkFonts();
  });
  await check('Login screen uses the same embedded font',async()=>{
    await page.goto('http://127.0.0.1:4180/preview.html?view=auth');await checkFonts();await noOverflow();
    await page.screenshot({path:'work/ui-ux-v5/font-auth-desktop.png'});
  });
  assert.deepEqual(failures,[]);
  fs.writeFileSync('work/ui-ux-v5/font-results.json',JSON.stringify({checks:results,failures},null,2));
  console.log('PASS '+results.length+' font checks; no external requests.');
}finally{await browser.close();}
