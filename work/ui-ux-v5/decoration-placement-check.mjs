import { chromium } from 'playwright-core';
import assert from 'node:assert/strict';
import fs from 'node:fs';
const browser = await chromium.launch({channel:'chrome',headless:true});
const page = await browser.newPage({viewport:{width:1366,height:900}});
page.setDefaultTimeout(8000);
const errors = [], results = [];
page.on('pageerror',e=>errors.push(String(e)));
await page.route('**/*',route=>{
  const url=new URL(route.request().url());
  if(['127.0.0.1','localhost'].includes(url.hostname)||['data:','blob:'].includes(url.protocol))return route.continue();
  errors.push('Unexpected external request: '+url.origin);return route.abort();
});
fs.mkdirSync('work/ui-ux-v5',{recursive:true});
const url='http://127.0.0.1:4180/preview.html';
const nav=name=>page.locator('.sidebar').getByRole('button',{name,exact:true});
const shot=name=>page.screenshot({path:'work/ui-ux-v5/'+name+'.png',fullPage:true});
const check=async(name,run)=>{await run();results.push(name);console.log('PASS '+name);};
const fill=async()=>{
  await nav('새 글 작성').click();
  await page.locator('#new-post-topic').fill('처음 방문하는 고객에게 카페를 소개해 주세요.');
  await page.locator('#new-post-article-type').selectOption('정보형');
  await page.locator('#new-post-keyword-0').fill('카페');
  await page.locator('#new-post-model').selectOption('gpt-5.6-terra');
  await page.locator('#new-post-reasoning').selectOption('medium');
};
const mockNaver=async()=>page.evaluate(()=>{
  const calls=window.__previewCalls;
  const record=(type,data,result)=>{calls.push({type,data});return {ok:true,result};};
  window.blowWorkHistory.add=async(...data)=>record('history-add',data,{});
  Object.assign(window.blowNaver,{
    open:async(data)=>{calls.push({type:'naver-open',data});return {ok:true,status:{stage:'WRITER_LINK_READY',message:'모의 연결 완료',currentUrl:'https://blog.naver.com/example',registeredBlogId:'example',actualBlogId:'example'}};},
    verify:async()=>{calls.push({type:'naver-verify'});return {ok:true,status:{stage:'WRITER_LINK_READY',message:'모의 재확인 완료',registeredBlogId:'example',actualBlogId:'example',currentUrl:'https://blog.naver.com/example'}};},
    saveDraft:async()=>record('save-draft',null,{currentUrl:'https://blog.naver.com/example',signals:[]}),
    openWriter:async()=>{calls.push({type:'naver-writer'});return {ok:true,status:{stage:'WRITER_READY',message:'모의 편집기 완료',registeredBlogId:'example',actualBlogId:'example',currentUrl:'https://blog.naver.com/example'}};},
    enterContent:async(data)=>record('enter',data,{stage:'INPUT_VERIFIED',titleLength:data.title.length,bodyLength:data.paragraphs.join('').length,paragraphCount:data.paragraphs.length}),
    listDividerStyles:async(...args)=>record('divider-list',args,{styles:[{id:'default',label:'구분선 1'},{id:'line1',label:'구분선 2'}]}),
    insertDivider:async(...args)=>record('divider-insert',args,{paragraphNumber:args[0],position:args[1],styleLabel:'구분선 2',dividerCount:1}),
    listQuoteStyles:async(...args)=>record('quote-list',args,{styles:[{id:'default',label:'인용구 1'},{id:'quotation_line',label:'인용구 2'}]}),
    insertQuote:async(...args)=>record('quote-insert',args,{paragraphNumber:args[0],position:args[1],styleLabel:'인용구 2',quoteCount:1}),
    listStickerCategories:async(...args)=>record('sticker-list',args,{categories:[{id:'mock-pack',label:'예시 묶음'}]}),
    insertRandomSticker:async(...args)=>record('sticker-insert',args,{paragraphNumber:args[0],position:args[1],categoryLabel:'예시 묶음',stickerLabel:'예시 스티커',stickerCount:1}),
  });
});
const setup=async()=>{
  await mockNaver();
  await nav('블로그 세팅').click();
  await page.locator('#naver-blog-url').fill('https://blog.naver.com/example');
  await page.getByRole('button',{name:'전용 Chrome 열기',exact:true}).click();
  await page.getByRole('button',{name:'연결됐어요, 새 글 작성',exact:true}).click();
};
const connect=async()=>{
  await page.getByRole('button',{name:'확인했어요, 임시저장으로'}).click();
  await page.getByRole('button',{name:'연결 확인 후 글쓰기 화면 열기',exact:true}).click();
  await page.locator('.editor-input-button').click();
};

const section=kind=>page.locator('section[aria-labelledby="'+kind+'-test-heading"]');
const compose=kind=>page.locator('section[aria-labelledby="compose-'+kind+'-heading"]');
const inserted=kind=>page.evaluate(k=>window.__previewCalls.filter(c=>c.type===k+'-insert').map(c=>c.data),kind);
const fresh=async(count=12)=>{
 await page.goto(url+'?state=ready');
 await setup(); await fill();
 await page.evaluate(n=>{
   const original=window.blowOpenAi.generateDraft;
   window.blowOpenAi.generateDraft=async data=>{
     const result=await original(data);
     result.draft.body=Array.from({length:n},(_,i)=>String(i+1).padStart(2,'0')+'번째 안내 문단입니다. 실제 외부 요청 없이 검수용 내용만 사용합니다.').join('\n\n');
     return result;
   };
 },count);
};
const prepare=async()=>{await page.getByRole('button',{name:'글 만들기',exact:true}).click();await connect();};
const ready=async kind=>{
 await section(kind).locator(kind==='sticker'?'.sticker-category-load-button':'.divider-style-load-button').click();
};
const enable=async kind=>page.locator('#compose-'+kind+'-enabled').selectOption('yes');
try {
 await fresh();
 await check('Random counts 1–10 replace all region/paragraph controls and survive navigation',async()=>{
   for(const kind of ['quote','sticker','divider'])await enable(kind);
   assert.equal(await page.locator('[id$="-anchor"],#compose-quote-position').count(),0);
   await page.locator('#compose-quote-count').selectOption('3');
   await page.locator('#compose-sticker-count').selectOption('2');
   await page.locator('#compose-divider-count').selectOption('10');
   for (const kind of ['quote','sticker','divider']) {
     assert.deepEqual(await page.locator('#compose-'+kind+'-count option').evaluateAll(options=>options.map(o=>o.value)),Array.from({length:10},(_,i)=>String(i+1)));
     assert.equal(await page.locator('#compose-'+kind+'-mode').count(),0);
     assert.equal(await compose(kind).getByRole('checkbox').count(),0);
   }
   await nav('블로그 세팅').click();await nav('새 글 작성').click();
   assert.equal(await page.locator('#compose-quote-count').inputValue(),'3');
   assert.equal(await page.locator('#compose-divider-count').inputValue(),'10');
   await compose('divider').scrollIntoViewIfNeeded();
   await page.screenshot({path:'work/ui-ux-v5/decorations-random-desktop.png'});
   await prepare();
   assert.equal(await page.locator('#divider-paragraph,#quote-paragraph,#sticker-paragraph').count(),0);
   assert.equal(await page.locator('#transfer-quote-count').inputValue(),'3');
   assert.match(await section('divider').innerText(),/10회 랜덤 배치/);
 });
 await check('Sequential quote batch locks editing/navigation, verifies all positions, and cannot repeat',async()=>{
   await ready('quote');
   const firstTarget = await page.evaluate(()=>window.__previewCalls.find(c=>c.type==='quote-list').data[0]);
   // Unrelated rerenders and other count changes must not reroll this quote plan.
   await page.evaluate(()=>{Math.random=()=>0.999;});
   await page.locator('#transfer-sticker-count').selectOption('3');
   await page.locator('#transfer-sticker-count').selectOption('2');
   await page.evaluate(()=>{
     const original=window.blowNaver.insertQuote;
     let first=true;
     window.blowNaver.insertQuote=(...args)=>{
       if(!first)return original(...args);
       first=false;
       return new Promise(resolve=>{window.__releaseQuote=()=>original(...args).then(resolve);});
     };
   });
   await section('quote').locator('.divider-insert-button').click();
   await page.waitForFunction(()=>Boolean(window.__releaseQuote));
   assert.equal(await page.locator('#transfer-quote-count').isDisabled(),true);
   await page.waitForFunction(()=>document.querySelector('.sidebar button[title="블로그 세팅"]')?.disabled);
   assert.equal(await nav('블로그 세팅').isDisabled(),true);
   assert.equal(await section('divider').locator('.divider-style-load-button').isDisabled(),true);
   await page.evaluate(()=>window.__releaseQuote());
   await page.waitForFunction(()=>window.__previewCalls.filter(c=>c.type==='quote-insert').length===3);
   await section('quote').getByText('삽입 확인 3/3회',{exact:true}).waitFor();
   const quoteCalls = await inserted('quote');
   assert.equal(quoteCalls[0][0],firstTarget);
   assert.equal(new Set(quoteCalls.map(a=>a[0])).size,3);
   assert.ok(quoteCalls.every(a=>a[1]==='after'));
   assert.deepEqual(quoteCalls.map(a=>a[0]),quoteCalls.map(a=>a[0]).sort((a,b)=>a-b));
   assert.equal(await section('quote').locator('.divider-insert-button').isDisabled(),true);
   await nav('사용 가이드').click();await nav('새 글 작성').click();
   assert.equal(await section('quote').locator('.divider-insert-button').isDisabled(),true);
 });
 await check('Up to ten sequential divider insertions and independent sticker counts preserve quote results',async()=>{
   await ready('divider');
   await section('divider').locator('.divider-insert-button').click();
   await section('divider').getByText('삽입 확인 10/10회',{exact:true}).waitFor();
   await ready('sticker');
   await section('sticker').locator('.divider-insert-button').click();
   await section('sticker').getByText('삽입 확인 2/2회',{exact:true}).waitFor();
   assert.equal(new Set((await inserted('divider')).map(a=>a[0])).size,10);
   assert.equal(new Set((await inserted('sticker')).map(a=>a[0])).size,2);
   assert.ok((await inserted('divider')).every(a=>a[0]>=1&&a[0]<=12&&a[1]==='after'));
   assert.equal((await inserted('quote')).length,3);
   await section('sticker').scrollIntoViewIfNeeded();
   await page.screenshot({path:'work/ui-ux-v5/decorations-transfer-result.png'});
 });
 await fresh();
 await check('Transfer uses content-aware boundaries and never separates headings from explanations',async()=>{
   await enable('quote');await page.locator('#compose-quote-count').selectOption('4');
   await page.evaluate(()=>{
     const original=window.blowOpenAi.generateDraft;
     window.blowOpenAi.generateDraft=async data=>{
       const result=await original(data);
       result.draft.body=['소개 문단입니다.','이어서 메뉴를 살펴봅니다.','메뉴 설명입니다.','## 방문 안내','방문 안내 본문입니다.','정리하면, 취향에 맞춰 선택해 보세요.'].join('\n\n');
       return result;
     };
   });
   await prepare();await ready('quote');
   await section('quote').locator('.divider-insert-button').click();
   await section('quote').getByText('삽입 확인 4/4회',{exact:true}).waitFor();
   assert.deepEqual((await inserted('quote')).map(a=>a[0]),[1,3,5,6]);
 });
 await fresh(2);
 await check('Short drafts display the reduced count and do not duplicate a boundary',async()=>{
   await enable('divider');
   await page.locator('#compose-divider-count').selectOption('10');
   await prepare();
   assert.match(await section('divider').innerText(),/실제 배치: 2회/);
   assert.match(await section('divider').innerText(),/짧은 글/);
   await ready('divider');
   await section('divider').locator('.divider-insert-button').click();
   await section('divider').getByText('삽입 확인 2/2회',{exact:true}).waitFor();
   assert.equal((await inserted('divider')).length,2);
 });
 await fresh();
 await check('A failed second insertion preserves partial progress and blocks retries even after other operations',async()=>{
   await enable('quote');await enable('divider');
   await page.locator('#compose-quote-count').selectOption('3');
   await prepare();await ready('quote');
   await page.evaluate(()=>{
     const original=window.blowNaver.insertQuote;
     let count=0;window.__attempts=0;
     window.blowNaver.insertQuote=async(...args)=>{
       window.__attempts++;count++;
       if(count===2)return {ok:false,error:{code:'QUOTE_INSERT_UNCONFIRMED',message:'모의 결과 확인 실패'}};
       return original(...args);
     };
   });
   await section('quote').locator('.divider-insert-button').click();
   await section('quote').getByText(/삽입 확인 1\/3회/).waitFor();
   await page.waitForFunction(()=>!document.querySelector('.sidebar button[title="블로그 세팅"]')?.disabled);
   assert.equal(await page.evaluate(()=>window.__attempts),2);
   assert.equal((await inserted('quote')).length,1);
   assert.equal(await section('quote').locator('.divider-insert-button').isDisabled(),true);
   await ready('divider');
   assert.equal(await section('quote').locator('.divider-insert-button').isDisabled(),true);
   assert.match(await section('quote').innerText(),/다시 실행하지 않습니다/);
   await nav('사용 가이드').click();await nav('새 글 작성').click();
   assert.equal(await section('quote').locator('.divider-insert-button').isDisabled(),true);
 });
 await fresh();
 await check('Stopping an in-flight batch ignores its late response and never dispatches the next insertion',async()=>{
   await enable('divider');await page.locator('#compose-divider-count').selectOption('3');
   await prepare();await ready('divider');
   await page.evaluate(()=>{
     const original=window.blowNaver.insertDivider;
     window.__attempts=0;
     window.blowNaver.insertDivider=(...args)=>{
       window.__attempts++;
       return new Promise(resolve=>{window.__releaseDivider=()=>original(...args).then(resolve);});
     };
   });
   await section('divider').locator('.divider-insert-button').click();
   await page.waitForFunction(()=>Boolean(window.__releaseDivider));
   await page.getByRole('button',{name:'작업 중단',exact:true}).click();
   await page.evaluate(()=>window.__releaseDivider());
   await page.waitForFunction(()=>!document.querySelector('.sidebar button[title="블로그 세팅"]')?.disabled);
   assert.equal(await page.evaluate(()=>window.__attempts),1);
   assert.equal(await section('divider').count(),0);
 });
 await fresh();
 await check('Counts have visible labels and keyboard selection capped at ten',async()=>{
   await enable('divider');
   const count=compose('divider').getByLabel('삽입 횟수 최대 10회');
   await count.focus();await page.keyboard.press('End');await page.keyboard.press('Enter');
   assert.equal(await count.inputValue(),'10');
   await page.keyboard.press('ArrowDown');await page.keyboard.press('Enter');
   assert.equal(await count.inputValue(),'10');
   await page.keyboard.press('Home');await page.keyboard.press('Enter');
   assert.equal(await count.inputValue(),'1');
   assert.match(await compose('divider').innerText(),/내용 전환 표현, 소제목 앞, 마무리 문단/);
 });
 await check('Desktop/mobile/landscape, dark OS, reduced motion and 200% text stay legible without overflow',async()=>{
   for(const viewport of [{width:1366,height:900},{width:768,height:900},{width:375,height:812},{width:844,height:390}]){
     await page.setViewportSize(viewport);
     assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));
     const labels=await compose('divider').locator('#compose-divider-count').evaluateAll(ns=>ns.map(n=>({width:n.getBoundingClientRect().width,height:n.getBoundingClientRect().height})));
     assert.ok(labels.every(n=>n.width>=44&&n.height>=44));
   }
   await page.setViewportSize({width:375,height:812});
   await page.emulateMedia({colorScheme:'dark',reducedMotion:'reduce'});
   await compose('divider').scrollIntoViewIfNeeded();
   await page.screenshot({path:'work/ui-ux-v5/decorations-mobile.png'});
   await page.evaluate(()=>document.documentElement.style.fontSize='200%');
   assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));
 });
 assert.deepEqual(errors,[]);
 console.log('All '+results.length+' placement checks passed. No live Naver writes or paid API calls.');
} finally {
 fs.writeFileSync('work/ui-ux-v5/decorations-results.json',JSON.stringify({results,errors,mode:'Local mock data only'},null,2));
 await browser.close();
}
