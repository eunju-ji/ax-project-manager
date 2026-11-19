const {test}=require('node:test');
const assert=require('node:assert/strict');
const {mkdtempSync,rmSync}=require('node:fs');
const {tmpdir}=require('node:os');
const {join}=require('node:path');
const {chromium}=require('playwright');
const {createServer}=require('./server.cjs');
test('13 browser: saved/reload, failed save leaves count, retry, persistent review idempotency',async()=>{
 const dir=mkdtempSync(join(tmpdir(),'ax-browser-'));
 const {server,s}=createServer({dir,seedMode:'small'});await new Promise(r=>server.listen(0,'127.0.0.1',r));
 let browser;
 try{
  browser=await chromium.launch({headless:true});const page=await browser.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));
  const base=`http://127.0.0.1:${server.address().port}`;
  await page.goto(base+'/?data=local');await page.locator('.review-trigger b').filter({hasText:'2'}).waitFor();
  if(await page.locator('.project-toggle').getAttribute('aria-expanded')!=='true') await page.locator('.project-toggle').click();
  await page.locator('.task-toggle').click();
  const first=page.locator('[data-action="review-answer"][data-id="RV-1"][data-value="완료"]');
  await first.click();await page.getByRole('status').filter({hasText:'저장됨'}).waitFor();assert.equal(await page.locator('.review-trigger b').textContent(),'1');
  await page.reload();await page.getByRole('status').filter({hasText:'저장됨'}).waitFor();assert.equal(await page.locator('.review-trigger b').textContent(),'1');if(await page.locator('.project-toggle').getAttribute('aria-expanded')!=='true') await page.locator('.project-toggle').click();
  await page.locator('.task-toggle').click();
  assert.equal(await first.getAttribute('aria-pressed'),'true');
  s.inject({failAt:1});
  const second=page.locator('[data-action="review-answer"][data-id="RV-2"][data-value="진행 중"]');await second.click();
  await page.getByRole('status').filter({hasText:'저장 실패'}).waitFor();assert.equal(await page.locator('.review-trigger b').textContent(),'1');assert.equal(await second.getAttribute('aria-pressed'),'false');
  s.inject({});await second.click();await page.getByRole('status').filter({hasText:'저장됨'}).waitFor();assert.equal(await page.locator('.review-trigger b').textContent(),'0');
  const before=s.all('history').length;
  const repeated=await page.request.post(base+'/api/decision',{data:{review_id:'RV-2',answer:'완료',change_id:'repeat',expected_version:1}});assert.equal(repeated.status(),200);assert.equal(s.all('history').length,before);
  const denied=await page.request.post(base+'/api/decision',{headers:{Origin:'http://untrusted.invalid'},data:{}});assert.equal(denied.status(),403);
  assert.deepEqual(errors,[]);
 }finally{await browser?.close();await new Promise(r=>server.close(r));rmSync(dir,{recursive:true,force:true});}
});
test('browser failure stages, response loss, reservation competition and reset',async()=>{
 for(const fault of [{failAt:2},{failAt:3},{failAt:4},{failAt:6},{loseAt:1},{loseAt:2},{loseAt:6}]){
  const dir=mkdtempSync(join(tmpdir(),'ax-stages-'));const {server,s}=createServer({dir,seedMode:'small'});
  await new Promise(r=>server.listen(0,'127.0.0.1',r));let browser;
  try{
   browser=await chromium.launch({headless:true});const page=await browser.newPage();
   const base=`http://127.0.0.1:${server.address().port}`;await page.goto(base+'/?data=local');
   await page.locator('.review-trigger b').filter({hasText:'2'}).waitFor();
   if(await page.locator('.project-toggle').getAttribute('aria-expanded')!=='true')await page.locator('.project-toggle').click();
   await page.locator('.task-toggle').click();s.inject(fault);
   await page.locator('[data-action="review-answer"][data-id="RV-1"][data-value="완료"]').click();
   await page.getByRole('status').filter({hasText:'저장 실패'}).waitFor();
   assert.equal(await page.locator('.review-trigger b').textContent(),'2');
   const data=await (await page.request.get(base+'/api/view')).json();assert.equal(data.decisions.length,0);
   if(s.get('reviews','RV-1').status==='deciding'){
    const competing=await page.request.post(base+'/api/decision',{data:{review_id:'RV-1',answer:'진행 중',change_id:'competitor',expected_version:1}});
    assert.equal(competing.status(),409);
   }
   s.inject({});await page.locator('[data-action="review-answer"][data-id="RV-1"][data-value="완료"]').click();
   await page.getByRole('status').filter({hasText:'저장됨'}).waitFor();
   assert.equal(s.get('tasks','TSK-LOCAL').status,'completed');assert.equal(s.get('reviews','RV-1').decision,'완료');
   await page.locator('[data-action="reviews"]').click();await page.locator('[data-action="reset-reviews"]').click();
   assert.equal(await page.locator('.review-trigger b').textContent(),'1');await page.reload();
   await page.locator('.review-trigger b').filter({hasText:'1'}).waitFor();
  }finally{await browser?.close();await new Promise(r=>server.close(r));rmSync(dir,{recursive:true,force:true});}
 }
});
test('large local dataset: weekly, empty week, unknown dates, timeline, files and reviews',async()=>{
 const dir=mkdtempSync(join(tmpdir(),'ax-large-browser-'));const {server}=createServer({dir});await new Promise(r=>server.listen(0,'127.0.0.1',r));let browser;
 try{
  browser=await chromium.launch({headless:true});const page=await browser.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto(`http://127.0.0.1:${server.address().port}/?data=local`);
  await page.locator('.project-toggle').nth(6).waitFor();assert.equal(await page.locator('.project-toggle').count(),7);
  const expected=require('../data.json').projects.map(p=>p.name);for(const name of expected)assert.ok((await page.locator('.project-toggle').allTextContents()).some(text=>text.includes(name)));assert.deepEqual(await page.locator('[data-action="week-person"]').allTextContents(),['전체','김지현','박성진','이수민']);
  assert.ok(Number(await page.locator('.summary-number strong').textContent())>0);assert.ok(await page.locator('.timeline-row').count()>=7);
  await page.locator('#weekSelect').selectOption('-13');assert.equal(await page.locator('.summary-number strong').textContent(),'0');await page.getByText('기록된 업무가 없습니다.').first().waitFor();
  await page.locator('.project-toggle[data-id="ax"]').click();assert.ok(await page.locator('.source-row').count()>0);
  await page.locator('[data-action="tab"][data-value="episode"]').click();await page.getByText('실행 시각 미상',{exact:false}).first().waitFor();
  await page.locator('[data-action="reviews"]').click();assert.ok(await page.locator('.review-record').count()>0);assert.deepEqual(errors,[]);
 }finally{await browser?.close();await new Promise(r=>server.close(r));rmSync(dir,{recursive:true,force:true});}
});

test('B6 browser reload discovers persisted request and retries exact request after server restart',async()=>{
 const dir=mkdtempSync(join(tmpdir(),'ax-recovery-browser-'));let current=createServer({dir,seedMode:'small'}),browser;
 await new Promise(r=>current.server.listen(0,'127.0.0.1',r));
 try{
  browser=await chromium.launch({headless:true});const page=await browser.newPage();let base='http://127.0.0.1:'+current.server.address().port;
  await page.goto(base+'/?data=local');await page.locator('.review-trigger b').filter({hasText:'2'}).waitFor();await page.locator('.project-toggle').click();await page.locator('.task-toggle').click();
  current.s.inject({failAt:6});await page.locator('[data-action="review-answer"][data-id="RV-1"][data-value="완료"]').click();await page.getByRole('status').filter({hasText:'저장 실패'}).waitFor();const original=current.s.all('runs').find(r=>r.request);
  await new Promise(r=>current.server.close(r));current=createServer({dir,seedMode:'small'});await new Promise(r=>current.server.listen(0,'127.0.0.1',r));base='http://127.0.0.1:'+current.server.address().port;
  await page.goto(base+'/?data=local');await page.locator('.review-trigger').click();const retry=page.locator('[data-action="retry-local"]');await retry.waitFor();assert.equal(await retry.getAttribute('data-id'),original.run_id);await retry.click();await page.getByRole('status').filter({hasText:'저장됨'}).waitFor();assert.equal(current.s.get('tasks','TSK-LOCAL').version,2);assert.equal(current.s.get('reviews','RV-1').status,'decided');assert.equal(current.s.all('runs').filter(r=>r.request).length,1);
 }finally{await browser?.close();await new Promise(r=>current.server.close(r));rmSync(dir,{recursive:true,force:true});}
});
