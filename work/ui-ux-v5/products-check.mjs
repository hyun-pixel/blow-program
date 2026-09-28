import { chromium } from 'playwright-core';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const browser = await chromium.launch({ channel:'chrome', headless:true });
const page = await browser.newPage({ viewport:{width:1366,height:900}, reducedMotion:'reduce' });
page.setDefaultTimeout(10000);
const results=[], errors=[], dir='work/ui-ux-v5';
fs.mkdirSync(dir,{recursive:true});
page.on('pageerror',e=>errors.push(String(e)));
await page.route('**/*',route=>{
  const url=new URL(route.request().url());
  if(['127.0.0.1','localhost'].includes(url.hostname)||['data:','blob:'].includes(url.protocol))return route.continue();
  errors.push('Unexpected external request: '+url.origin);return route.abort();
});
const check=async(name,run)=>{await run();results.push(name);console.log('PASS '+name);};
const nav=name=>page.locator('.sidebar').getByRole('button',{name,exact:true});
const inputs=()=>page.locator('.brand-product-input input');
const prices=()=>page.locator('.brand-product-row input[id^="brand-product-price-"]');
const productSave=()=>page.getByRole('button',{name:'상품·서비스 저장',exact:true});
const add=()=>page.getByRole('button',{name:'상품·서비스 추가',exact:true});
const saved=()=>page.evaluate(async()=>(await window.blowBrandProfile.get('preview-user')).profile);
const shot=async(name,selector)=>{
 await page.locator(selector).evaluate(n=>window.scrollTo(0,n.getBoundingClientRect().top+scrollY-88));
 await page.screenshot({path:dir+'/products-'+name+'.png'});
};
try{
 await page.goto('http://127.0.0.1:4180/preview.html');
 await page.locator('#brand-brandName:not([disabled])').waitFor();
 await page.evaluate(()=>{
   window.__productSaveOriginal=window.blowBrandProfile.saveProducts;
   window.__productSaves=[];
   window.blowBrandProfile.saveProducts=async(id,items)=>{
     window.__productSaves.push([...items]);
     return window.__productSaveOriginal(id,items);
   };
   window.__recordProductSave=window.blowBrandProfile.saveProducts;
 });
 await check('Initial profile prerequisite is explained; removed headings and fields are absent',async()=>{
   assert.equal(await productSave().isDisabled(),true);
   for(const id of ['priceInfo','consultationLink','accentColor','imageStyle','productsAndServices'])
     assert.equal(await page.locator('#brand-'+id).count(),0);
   for(const name of ['운영 및 소개 정보','연락 및 예약 정보','이미지 기본 방향'])
     assert.equal(await page.getByRole('heading',{name,exact:true}).count(),0);
   assert.equal(await page.locator('form form').count(),0);
   assert.equal(await inputs().first().getAttribute('required'),'');
   assert.equal(await prices().first().getAttribute('required'),null);
   assert.ok(await page.locator('#brand-products-heading').evaluate(n=>Boolean(n.compareDocumentPosition(document.querySelector('#brand-optional-heading')) & Node.DOCUMENT_POSITION_FOLLOWING)));
   await inputs().first().fill('상품 A');
   await prices().first().fill('30,000원');
   for(const key of ['brandName','industry','brandIntroduction','defaultTone','businessHours','coreStrengths','targetCustomers','mustEmphasize','phoneNumber','address'])
     await page.locator('#brand-'+key).fill('예시 '+key);
   await page.getByRole('button',{name:'블로그 세팅 저장',exact:true}).click();
   await page.getByRole('heading',{name:'블로그 세팅 저장 완료',exact:true}).waitFor();
   assert.equal((await saved()).productsAndServices,'');
   assert.equal(await inputs().first().inputValue(),'상품 A');
   assert.equal(await prices().first().inputValue(),'30,000원');
   assert.equal(await productSave().isEnabled(),true);
 });
 await check('Individual add/remove controls manage rows with keyboard focus',async()=>{
   await add().click();
   assert.equal(await inputs().count(),2);
   await page.waitForFunction(()=>document.querySelectorAll('.brand-product-input input')[1]===document.activeElement);
   assert.equal(await inputs().nth(1).evaluate(n=>document.activeElement===n),true);
   await inputs().nth(1).fill('서비스 B');
   await add().click();
   await inputs().nth(2).fill('임시 항목');
   await page.getByRole('button',{name:'상품·서비스 3 삭제',exact:true}).click();
   assert.equal(await inputs().count(),2);
   await page.waitForFunction(()=>document.querySelectorAll('.brand-product-input input')[1]===document.activeElement);
   assert.equal(await inputs().nth(1).evaluate(n=>document.activeElement===n),true);
 });
 await check('Product-only save preserves both saved profile and unsaved main-field edits',async()=>{
   await page.locator('#brand-brandName').fill('아직 저장하지 않은 새 브랜드');
   await productSave().click();
   await page.locator('.brand-products-panel [role=status]').waitFor();
   assert.equal((await saved()).productsAndServices,'상품 A\n서비스 B');
   assert.equal((await saved()).brandName,'예시 brandName');
   assert.deepEqual((await saved()).productPrices,{'상품 A':'30,000원'});
   assert.equal(await prices().nth(1).inputValue(),'');
   assert.equal(await page.locator('#brand-brandName').inputValue(),'아직 저장하지 않은 새 브랜드');
   assert.equal(await page.locator('.brand-profile-form .unsaved-label').isVisible(),true);
   await shot('saved-1366','#brand-products-heading');
 });
 await check('Saved choices appear immediately in compose and reach generation unchanged',async()=>{
   await page.locator('#naver-blog-url').fill('https://blog.naver.com/example');
   await page.getByRole('button',{name:'전용 Chrome 열기',exact:true}).click();
   await page.getByRole('button',{name:'연결됐어요, 새 글 작성',exact:true}).click();
   const service=page.locator('#new-post-service');
   await page.waitForFunction(()=>document.querySelector('#new-post-service option[value="상품 A"]'));
   assert.deepEqual(await service.locator('option').evaluateAll(ns=>ns.map(n=>n.value)),['','상품 A','서비스 B','__custom__']);
   assert.equal(await service.locator('option[value="상품 A"]').textContent(),'상품 A — 30,000원');
   assert.equal(await service.locator('option[value="서비스 B"]').textContent(),'서비스 B');
   await service.selectOption('서비스 B');
   await page.locator('#new-post-topic').fill('상품을 처음 이용하는 고객을 위한 소개');
   await page.locator('#new-post-article-type').selectOption('정보형');
   await page.locator('#new-post-keyword-0').fill('상품');
   await page.locator('#new-post-model').selectOption('gpt-5.6-terra');
   await page.locator('#new-post-reasoning').selectOption('medium');
   await page.getByRole('button',{name:'글 만들기',exact:true}).click();
   await page.getByRole('button',{name:'확인했어요, 임시저장으로'}).waitFor();
   assert.equal(await page.evaluate(()=>window.__previewCalls.filter(c=>c.type==='draft').at(-1).data.service),'서비스 B');
   await shot('compose-1366','#compose-section-05');
 });
 await check('Manage button focuses the catalog; unsaved catalog changes do not leak through main save',async()=>{
   await page.getByRole('button',{name:'상품·서비스 관리',exact:true}).click();
   await page.waitForFunction(()=>document.activeElement?.id==='brand-products-heading');
   assert.equal(await inputs().nth(1).inputValue(),'서비스 B');
   await inputs().nth(1).fill('서비스 C');
   await prices().nth(1).fill('1회 50,000원');
   await page.getByRole('button',{name:'블로그 세팅 저장',exact:true}).click();
   await page.getByRole('heading',{name:'블로그 세팅 저장 완료',exact:true}).waitFor();
   assert.equal((await saved()).productsAndServices,'상품 A\n서비스 B');
   assert.equal(await inputs().nth(1).inputValue(),'서비스 C');
   assert.equal(await prices().nth(1).inputValue(),'1회 50,000원');
   assert.deepEqual((await saved()).productPrices,{'상품 A':'30,000원'});
   await nav('새 글 작성').click();
   assert.equal(await page.locator('#new-post-service').inputValue(),'서비스 B');
   assert.equal(await page.locator('#new-post-service option[value="서비스 C"]').count(),0);
 });
 await check('Removing the selected product resets only that selection, retaining the writing draft',async()=>{
   await nav('블로그 세팅').click();
   await productSave().click();
   await page.locator('.brand-products-panel [role=status]').waitFor();
   await nav('새 글 작성').click();
   await page.waitForFunction(()=>document.querySelector('#new-post-service option[value="서비스 C"]'));
   assert.equal(await page.locator('#new-post-service').inputValue(),'');
   assert.equal(await page.locator('#new-post-topic').inputValue(),'상품을 처음 이용하는 고객을 위한 소개');
   await page.locator('#new-post-service').selectOption('__custom__');
   await page.locator('#new-post-custom-service').fill('이번 글 전용 상품');
   await nav('블로그 세팅').click();
   await inputs().first().fill('상품 D');
   await prices().first().fill('');
   await productSave().click();
   await page.locator('.brand-products-panel [role=status]').waitFor();
   await nav('새 글 작성').click();
   await page.waitForFunction(()=>document.querySelector('#new-post-service option[value="상품 D"]'));
   assert.deepEqual((await saved()).productPrices,{'서비스 C':'1회 50,000원'});
   assert.equal(await page.locator('#new-post-service option[value="상품 D"]').textContent(),'상품 D');
   assert.equal(await page.locator('#new-post-service').inputValue(),'__custom__');
   assert.equal(await page.locator('#new-post-custom-service').inputValue(),'이번 글 전용 상품');
 });
 await nav('블로그 세팅').click();
 await check('Price-only changes save on Enter without submitting main settings',async()=>{
   const brand=(await saved()).brandName;
   await page.locator('#brand-brandName').fill('가격 저장 중 보존할 미저장 브랜드');
   await prices().first().fill('1회 20,000원');
   await prices().first().press('Enter');
   await page.locator('.brand-products-panel [role=status]').waitFor();
   assert.deepEqual((await saved()).productPrices,{'상품 D':'1회 20,000원','서비스 C':'1회 50,000원'});
   assert.equal((await saved()).brandName,brand);
   await nav('새 글 작성').click();
   await page.waitForFunction(()=>document.querySelector('#new-post-service option[value="상품 D"]')?.textContent==='상품 D — 1회 20,000원');
   await nav('블로그 세팅').click();
   assert.equal(await prices().first().inputValue(),'1회 20,000원');
 });
 await check('Empty and duplicate entries are blocked without a save or lost input',async()=>{
   const previous=await page.evaluate(()=>window.__productSaves.length);
   await inputs().nth(1).fill('상품 D');
   await productSave().click();
   assert.match(await page.locator('.brand-products-panel [role=alert]').innerText(),/중복/);
   await inputs().nth(1).fill('');
   await productSave().click();
   assert.match(await page.locator('.brand-products-panel [role=alert]').innerText(),/빈 항목/);
   assert.equal(await page.evaluate(()=>window.__productSaves.length),previous);
   assert.equal((await saved()).productsAndServices,'상품 D\n서비스 C');
   await inputs().nth(1).fill('서비스 E');
 });
 await check('Save errors retain rows; in-flight saves lock edits and navigation then recover',async()=>{
   await page.evaluate(()=>{window.blowBrandProfile.saveProducts=async()=>{throw new Error('test failure');};});
   await productSave().click();
   await page.locator('.brand-products-panel [role=alert]').waitFor();
   assert.equal(await inputs().nth(1).inputValue(),'서비스 E');
   assert.equal(await nav('새 글 작성').isEnabled(),true);
   await page.evaluate(()=>{
     window.blowBrandProfile.saveProducts=(...args)=>new Promise(resolve=>{
       window.__releaseProductSave=()=>window.__recordProductSave(...args).then(resolve);
     });
   });
   await productSave().click();
   await page.waitForFunction(()=>typeof window.__releaseProductSave==='function');
   await page.waitForFunction(()=>document.querySelector('.sidebar button[title="새 글 작성"]')?.disabled);
   assert.equal(await page.getByRole('button',{name:'목록 저장 중…',exact:true}).isDisabled(),true);
   assert.equal(await nav('새 글 작성').isDisabled(),true);
   assert.equal(await inputs().first().isDisabled(),true);
   assert.equal(await prices().first().isDisabled(),true);
   await page.evaluate(()=>window.__releaseProductSave());
   await page.locator('.brand-products-panel [role=status]').waitFor();
   assert.equal((await saved()).productsAndServices,'상품 D\n서비스 E');
   assert.deepEqual((await saved()).productPrices,{'상품 D':'1회 20,000원','서비스 E':'1회 50,000원'});
   await page.waitForFunction(()=>!document.querySelector('.sidebar button[title="새 글 작성"]')?.disabled);
   assert.equal(await nav('새 글 작성').isEnabled(),true);
 });
 await check('Main settings save errors also release navigation and preserve both sets of inputs',async()=>{
   await page.evaluate(()=>{
     window.__mainSaveOriginal=window.blowBrandProfile.save;
     window.blowBrandProfile.save=async()=>{throw new Error('main save failure');};
   });
   await page.locator('#brand-brandName').fill('실패 후에도 보존할 이름');
   await page.getByRole('button',{name:'블로그 세팅 저장',exact:true}).click();
   await page.getByRole('alert').filter({hasText:'입력 내용은 유지됩니다'}).waitFor();
   await page.waitForFunction(()=>!document.querySelector('.sidebar button[title="새 글 작성"]')?.disabled);
   assert.equal(await page.locator('#brand-brandName').inputValue(),'실패 후에도 보존할 이름');
   assert.equal(await inputs().nth(1).inputValue(),'서비스 E');
   await page.evaluate(()=>{window.blowBrandProfile.save=window.__mainSaveOriginal;});
 });
 await check('Catalog typography, focus targets and layout work on narrow, landscape, dark OS and enlarged text',async()=>{
   assert.equal(await page.locator('#brand-products-heading').evaluate(n=>parseFloat(getComputedStyle(n).fontSize)),24);
   for(const viewport of [{width:1366,height:900},{width:768,height:900},{width:375,height:812},{width:844,height:390}]){
     await page.setViewportSize(viewport);
     assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));
     const boxes=await inputs().evaluateAll(ns=>ns.map(n=>n.getBoundingClientRect().toJSON()));
     assert.equal(boxes[0].x,boxes[1].x);
     assert.ok(boxes[1].y-boxes[0].bottom>=32);
     for(const button of await page.locator('.brand-products-panel button').all()){
       const box=await button.boundingBox();assert.ok(box.width>=44&&box.height>=44);
     }
   }
   await page.setViewportSize({width:375,height:812});
   await page.emulateMedia({colorScheme:'dark',reducedMotion:'reduce'});
   await shot('mobile','#brand-products-heading');
   await page.evaluate(()=>document.documentElement.style.fontSize='200%');
   assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));
 });
 assert.deepEqual(errors,[]);
 fs.writeFileSync(dir+'/products-results.json',JSON.stringify({results,errors,mode:'Local mocks only; no external services or customer data'},null,2));
 console.log('All '+results.length+' product settings checks passed.');
} finally { await browser.close(); }
