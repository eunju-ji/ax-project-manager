import {chromium,expect} from '@playwright/test';
import {createRequire} from 'node:module';import fs from 'node:fs';import os from 'node:os';import path from 'node:path';
const require=createRequire(import.meta.url);const {createServer}=require('../../server/node/server.cjs');
const dir=fs.mkdtempSync(path.join(os.tmpdir(),'ax-ui-correction-'));
const {server}=createServer({dir,seedMode:'small',env:{AUTH_MODE:'off',DEFAULT_USER_ID:'logged-in'}});
await new Promise(r=>server.listen(0,'127.0.0.1',r));const origin='http://127.0.0.1:'+server.address().port;
const browser=await chromium.launch({headless:true});
try{
 const page=await browser.newPage({viewport:{width:1440,height:900}});
 await page.goto(origin+'/?data=local');await expect(page.locator('.wbs-project-row')).toHaveCount(1);
 if(await page.locator('.project-toggle[data-action="project"]').first().getAttribute('aria-expanded')!=='true')await page.locator('.project-toggle[data-action="project"]').first().click();await page.locator('.gantt-task-toggle').first().click();
 await page.locator('.task-drawer [data-entity="task"][data-op="update"]').click();
 await page.locator('#correction-form input[name="title"]').fill('사람이 바꾼 제목');await page.locator('[data-action="correction-save"]').click();
 await expect(page.locator('#task-drawer-title')).toHaveText('사람이 바꾼 제목');
 await page.locator('[data-entity="worklog"][data-op="create"]').click();
 await page.locator('#correction-form input[name="title"]').fill('수동 작업');await page.locator('[data-action="correction-save"]').click();
 await expect(page.locator('.drawer-entry')).toHaveCount(1);
 await page.locator('.drawer-entry [data-op="update"]').first().click();await page.locator('#correction-form input[name="title"]').fill('고친 작업');await page.locator('[data-action="correction-save"]').click();await expect(page.locator('.drawer-entry strong')).toHaveText('고친 작업');
 page.once('dialog',d=>d.accept());await page.locator('.drawer-entry [data-op="remove"]').click();await expect(page.locator('.drawer-entry')).toHaveCount(0);
 await page.keyboard.press('Escape');await expect(page.locator('.task-drawer')).toHaveCount(0);await page.locator('[data-entity="task"][data-op="create"]').click();await page.locator('#correction-form input[name="title"]').fill('추가 태스크');await page.locator('[data-action="correction-save"]').click();await expect(page.locator('.gantt-task-copy').filter({hasText:'추가 태스크'})).toHaveCount(1);
 await page.reload();await expect(page.locator('.wbs-project-row')).toHaveCount(1);
 await page.request.post(origin+'/api/correction',{headers:{Origin:origin},data:{entity:'review',op:'decide',id:'RV-1',version:1,fields:{decision:'완료'}}});await page.reload();await page.locator('[data-action="reviews"]').first().click();await expect(page.locator('[data-entity="review"][data-op="reopen"]')).toHaveCount(1);await page.locator('[data-entity="review"][data-op="reopen"]').click();await expect(page.locator('[data-entity="review"][data-op="reopen"]')).toHaveCount(0);await page.keyboard.press('Escape');
 if(await page.locator('.project-toggle[data-action="project"]').first().getAttribute('aria-expanded')!=='true')await page.locator('.project-toggle[data-action="project"]').first().click();await page.locator('.gantt-task-toggle').first().click();await page.locator('.task-drawer [data-entity="task"][data-op="update"]').click();await page.route('**/api/correction',r=>r.fulfill({status:409,contentType:'application/json',body:'{}'}));await page.locator('[data-action="correction-save"]').click();await expect(page.locator('.correction-status')).toContainText('다른 변경이 먼저 저장됐습니다.');await page.unroute('**/api/correction');
 await page.route('**/api/me',r=>r.fulfill({contentType:'application/json',body:JSON.stringify({role:'viewer',csrf:null,local:true})}));await page.reload();await expect(page.locator('.wbs-project-row')).toHaveCount(1);if(await page.locator('.project-toggle[data-action="project"]').first().getAttribute('aria-expanded')!=='true')await page.locator('.project-toggle[data-action="project"]').first().click();await page.locator('.gantt-task-toggle').first().click();await expect(page.locator('[data-action="correction"]')).toHaveCount(0);
 const data=JSON.parse(fs.readFileSync(path.join(dir,'corrected-dataset.json')));expect(data.history.every(h=>h.actor_id==='logged-in')).toBe(true);
 console.log('Synthetic correction navigation: pass');await page.close();
}finally{await browser.close();await new Promise(r=>server.close(r));fs.rmSync(dir,{recursive:true,force:true});}
