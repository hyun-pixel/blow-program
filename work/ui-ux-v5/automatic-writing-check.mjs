import { chromium } from 'playwright-core';
import assert from 'node:assert/strict';
import fs from 'node:fs';
const browser = await chromium.launch({channel:'chrome',headless:true});
const page = await browser.newPage({viewport:{width:1366,height:900},reducedMotion:'reduce'});
page.setDefaultTimeout(10000);
const errors=[],results=[];
page.on('pageerror',error=>errors.push(String(error)));
page.on('dialog',dialog=>{errors.push('Unexpected browser confirmation');return dialog.dismiss();});
await page.route('**/*',route=>{
  const url=new URL(route.request().url());
  if(['127.0.0.1','localhost'].includes(url.hostname)||['data:','blob:'].includes(url.protocol))return route.continue();
  errors.push('Unexpected external request: '+url.origin);return route.abort();
});
const nav=name=>page.locator('.sidebar').getByRole('button',{name,exact:true});
const calls=type=>page.evaluate(t=>window.__previewCalls.filter(c=>c.type===t),type);
const setup=async()=>{
  await page.locator('#naver-blog-url').fill('https://blog.naver.com/example');
  await page.getByRole('button',{name:'전용 Chrome 열기',exact:true}).click();
  await page.getByRole('button',{name:'연결됐어요, 새 글 작성',exact:true}).click();
  await page.locator('#new-post-model option[value="gpt-5.6-terra"]').waitFor({state:'attached'});
};
const fresh=async()=>{
  await page.goto('http://127.0.0.1:4180/preview.html?state=ready');
  await page.evaluate(()=>localStorage.clear());
  await page.reload();await setup();
};
const fill=async(topic='첫 번째 카페 안내',length='1800')=>{
  await page.locator('#new-post-topic').fill(topic);
  await page.locator('#new-post-article-type').selectOption('정보형');
  await page.locator('#new-post-target-length').selectOption(length);
  await page.locator('#new-post-keyword-0').fill('카페');
  await page.locator('#new-post-model').selectOption('gpt-5.6-terra');
  await page.locator('#new-post-reasoning').selectOption('medium');
};
const add=()=>page.getByRole('button',{name:'목록에 추가',exact:true}).click();
const confirmation=()=>page.getByRole('dialog',{name:'자동 작성을 시작할까요?',exact:true});
const approve=()=>confirmation().getByRole('button',{name:'자동 작성 시작',exact:true}).click();
const start=async()=>{await page.getByRole('button',{name:/목록 전체 자동 작성·저장/}).click();await approve();};
const check=async(name,run)=>{await run();results.push(name);console.log('PASS '+name);};
try {
  await fresh();
  await check('Independent per-post settings, edit and persistent reload',async()=>{
    await fill();await page.locator('#compose-quote-enabled').selectOption('yes');await page.locator('#compose-quote-count').selectOption('2');await add();
    await fill('두 번째 카페 서비스 소개','700');await page.locator('#compose-quote-enabled').selectOption('no');await page.locator('#compose-sticker-enabled').selectOption('yes');await page.locator('#compose-sticker-count').selectOption('1');await add();
    assert.equal(await page.locator('.queue-job').count(),2);
    assert.match(await page.locator('.queue-job').nth(0).innerText(),/1,800자.*GPT/);
    await page.locator('.queue-job').nth(0).getByRole('button',{name:'설정 수정'}).click();
    assert.equal(await page.locator('#compose-quote-count').inputValue(),'2');
    await page.locator('#new-post-topic').fill('수정된 첫 번째 카페 안내');
    await page.getByRole('button',{name:'설정 수정 저장',exact:true}).click();
    assert.equal(await page.locator('.queue-job').count(),2);
    await page.reload();await setup();
    assert.match(await page.locator('.queue-job').nth(0).innerText(),/수정된 첫 번째/);
    assert.equal((await calls('draft')).length,0);
  });
  await check('Two posts save sequentially without per-post confirmations and lock controls',async()=>{
    await page.evaluate(()=>{
      const original=window.blowOpenAi.generateDraft;let first=true;
      window.blowOpenAi.generateDraft=(data)=>{
        if(!first)return original(data);first=false;
        return new Promise(resolve=>{window.__release=()=>original(data).then(resolve);});
      };
    });
    await start();await page.waitForFunction(()=>Boolean(window.__release));
    assert.equal(await nav('블로그 세팅').isDisabled(),true);
    assert.equal(await page.locator('#new-post-topic').isDisabled(),true);
    assert.equal(await page.locator('#compose-sticker-enabled').isDisabled(),true);
    await page.evaluate(()=>window.__release());
    await page.waitForFunction(()=>document.querySelectorAll('.queue-job.is-saved').length===2);
    assert.equal((await calls('save')).length,2);
    const draftCalls=await calls('draft');
    assert.equal(draftCalls[0].data.targetLength,1800);assert.equal(draftCalls[1].data.targetLength,700);
    assert.equal((await calls('quote')).length,2);assert.equal((await calls('sticker')).length,1);
    const pipeline=await page.evaluate(()=>window.__previewCalls.filter(c=>['writer','draft','enter','save','history-add'].includes(c.type)).map(c=>c.type));
    assert.deepEqual(pipeline,['writer','draft','enter','save','history-add','writer','draft','enter','save','history-add']);
    assert.equal(await page.getByRole('button',{name:'확인했어요, 임시저장으로'}).count(),0);
    await page.locator('#writing-queue').evaluate(element=>element.scrollIntoView({block:'start'}));
    await page.screenshot({path:'work/ui-ux-v5/automatic-writing-desktop.png'});
    assert.equal(await page.getByRole('button',{name:/목록 전체 자동 작성·저장/}).isDisabled(),true);
    await page.getByRole('button',{name:'저장한 글 확인',exact:true}).click();
    await page.getByRole('heading',{name:'작업 내역',exact:true}).waitFor();
    assert.equal((await calls('save')).length,2);
    await nav('새 글 작성').click();
  });
  await check('Saved items never run again after restart',async()=>{
    await page.reload();await setup();
    assert.equal(await page.locator('.queue-job.is-saved').count(),2);
    assert.equal(await page.getByRole('button',{name:/목록 전체 자동 작성·저장/}).isDisabled(),true);
    assert.equal((await calls('draft')).length,0);
  });
  await check('Single-post action runs only that post and keeps other jobs pending',async()=>{
    await fresh();await fill('나중에 작성할 주제');await add();
    await fill('지금 작성할 주제');
    await page.getByRole('button',{name:'이 글 자동 작성·저장',exact:true}).click();
    await approve();
    await page.waitForFunction(()=>document.querySelectorAll('.queue-job.is-saved').length===1);
    assert.equal(await page.locator('.queue-job.is-queued').count(),1);
    assert.equal((await calls('draft'))[0].data.topic,'지금 작성할 주제');
    assert.equal((await calls('save')).length,1);
  });
  await check('Declining initial cost confirmation spends nothing and retains settings',async()=>{
    await fresh();await fill();
    await page.getByRole('button',{name:'이 글 자동 작성·저장',exact:true}).click();
    await confirmation().getByRole('button',{name:'취소',exact:true}).click();
    assert.equal((await calls('draft')).length,0);
    assert.equal(await page.locator('.queue-job.is-queued').count(),1);
    assert.equal(await page.locator('#new-post-topic').inputValue(),'첫 번째 카페 안내','Canceling execution must not erase the topic');
    assert.equal(await page.locator('#new-post-keyword-0').inputValue(),'카페','Canceling execution must not erase the keyword');
  });
  await check('Retry after cancellation uses the same job even when browser confirmations are blocked',async()=>{
    await page.evaluate(()=>{window.confirm=()=>false;});
    const single=page.getByRole('button',{name:'이 글 자동 작성·저장',exact:true});
    await single.click();
    await confirmation().waitFor();
    assert.equal(await page.locator('.queue-job').count(),1);
    assert.equal((await calls('draft')).length,0);
    assert.equal((await calls('writer')).length,0);
    assert.equal(await confirmation().getByRole('button',{name:'취소',exact:true}).evaluate(el=>el===document.activeElement),true);
    await page.keyboard.press('Tab');
    assert.equal(await confirmation().getByRole('button',{name:'자동 작성 시작',exact:true}).evaluate(el=>el===document.activeElement),true);
    await page.keyboard.press('Tab');await page.keyboard.press('Tab');
    assert.equal(await confirmation().evaluate(el=>el.contains(document.activeElement)),true);
    await page.keyboard.press('Escape');
    await confirmation().waitFor({state:'hidden'});
    assert.equal(await single.evaluate(el=>el===document.activeElement),true);
    assert.equal(await page.locator('#new-post-topic').inputValue(),'첫 번째 카페 안내');
    await page.locator('#new-post-topic').fill('취소 후 수정한 카페 안내');
    await single.click();
    await confirmation().waitFor();
    assert.equal(await page.locator('.queue-job').count(),1);
    await page.screenshot({path:'work/ui-ux-v5/single-writing-confirmation-desktop.png'});
    await page.setViewportSize({width:375,height:812});
    assert.ok(await confirmation().evaluate(el=>el.scrollWidth<=el.clientWidth+1));
    await page.screenshot({path:'work/ui-ux-v5/single-writing-confirmation-mobile.png'});
    await page.setViewportSize({width:844,height:390});
    await page.evaluate(()=>document.documentElement.style.fontSize='200%');
    assert.ok(await confirmation().evaluate(el=>el.scrollWidth<=el.clientWidth+1 && el.getBoundingClientRect().bottom<=innerHeight));
    await page.evaluate(()=>document.documentElement.style.fontSize='');
    await page.setViewportSize({width:1366,height:900});
    await confirmation().getByRole('button',{name:'자동 작성 시작',exact:true}).evaluate(button=>{button.click();button.click();});
    await page.waitForFunction(()=>document.querySelectorAll('.queue-job.is-saved').length===1);
    assert.equal((await calls('draft')).length,1);
    assert.equal((await calls('draft'))[0].data.topic,'취소 후 수정한 카페 안내');
    assert.equal((await calls('save')).length,1);
    assert.equal(await page.locator('.queue-job').count(),1);
    assert.equal(await page.locator('#new-post-topic').inputValue(),'');
    assert.equal(await page.locator('#new-post-topic-error').count(),0);
  });
  await check('Empty topics and keywords still prevent execution',async()=>{
    await fresh();await fill('');
    await page.getByRole('button',{name:'이 글 자동 작성·저장',exact:true}).click();
    assert.equal(await page.locator('#new-post-topic-error').innerText(),'글의 주제를 입력해 주세요.');
    assert.equal(await confirmation().isVisible(),false);
    await fill();await page.locator('#new-post-keyword-0').fill('');
    await page.getByRole('button',{name:'이 글 자동 작성·저장',exact:true}).click();
    assert.equal(await page.locator('#new-post-keyword-0-error').innerText(),'기본 키워드를 입력해 주세요.');
    assert.equal(await page.locator('.queue-job').count(),0);
    assert.equal((await calls('draft')).length,0);
  });
  await check('Stop during generation leaves remaining jobs pending and does not input text',async()=>{
    await fresh();await fill();await add();
    await fill('두 번째 주제');await add();
    await page.evaluate(()=>{
      const original=window.blowOpenAi.generateDraft;
      window.blowOpenAi.generateDraft=data=>new Promise(resolve=>{window.__release=()=>original(data).then(resolve);});
    });
    await start();await page.waitForFunction(()=>Boolean(window.__release));
    await page.getByRole('button',{name:'자동 작성 중단',exact:true}).click();
    await page.evaluate(()=>window.__release());
    await page.waitForFunction(()=>document.querySelectorAll('.queue-job.is-interrupted').length===1);
    assert.equal((await calls('enter')).length,0);assert.equal((await calls('save')).length,0);
    assert.equal(await page.locator('.queue-job.is-queued').count(),1);
  });
  await check('Uncertain save stops the batch without retry or false success',async()=>{
    await fresh();await fill();await add();await fill('다음 글');await add();
    await page.evaluate(()=>{window.blowNaver.saveDraft=async()=>{window.__previewCalls.push({type:'save'});return {ok:false,error:{code:'DRAFT_SAVE_UNCONFIRMED',message:'저장 결과를 확인하지 못했습니다.'}};};});
    await start();await page.waitForFunction(()=>document.querySelectorAll('.queue-job.is-failed').length===1);
    assert.equal((await calls('save')).length,1);assert.equal((await calls('draft')).length,1);
    assert.equal(await page.locator('.queue-job.is-queued').count(),1);assert.equal(await page.locator('.queue-job.is-saved').count(),0);
  });
  await check('Manual pack names are required before starting',async()=>{
    await fresh();await fill();await page.locator('#compose-sticker-enabled').selectOption('yes');await page.locator('#compose-sticker-category').selectOption('manual');
    await add();assert.equal(await page.locator('.queue-job').count(),0);
    await page.locator('#writing-queue').getByRole('alert').filter({hasText:'묶음 이름'}).waitFor();
  });
  await check('Small viewport, reduced motion and enlarged text do not overflow',async()=>{
    await page.locator('#compose-sticker-name').fill('예시 묶음');await add();
    await page.setViewportSize({width:375,height:812});await page.locator('#writing-queue').scrollIntoViewIfNeeded();
    assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));
    await page.screenshot({path:'work/ui-ux-v5/automatic-writing-mobile.png'});
    await page.setViewportSize({width:844,height:390});
    await page.evaluate(()=>document.documentElement.style.fontSize='125%');
    assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));
  });
  assert.deepEqual(errors,[]);
  fs.writeFileSync('work/ui-ux-v5/automatic-writing-results.json',JSON.stringify({checks:results,errors},null,2));
  console.log('PASS '+results.length+' automatic-writing UI checks; no external requests.');
} finally {await browser.close();}
