import { chromium, expect } from '@playwright/test';
import {checkWeeklyLayout} from './weekly-layout.mjs';
import {checkTimelineColumns} from './timeline-columns.mjs';
import {checkSummaryResources} from './summary-resources.mjs';
import {checkSummaryBoundary} from './summary-boundary.mjs';
import { PNG } from 'pngjs';
import pixelmatch from 'pixelmatch';
import { createServer } from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createHash } from 'node:crypto';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const baseline = path.join(root, 'tests/visual/baseline');
const results = path.join(root, 'test-results');
const update = process.argv.includes('--update');
const navigation = process.argv.includes('--navigation');
const fixture = JSON.parse(await fs.readFile(path.join(root, 'data.json'), 'utf8'));
if (fixture.demoAsOf !== '2026-11-17') throw Error('demoAsOf fixture changed: review baseline explicitly');
await fs.mkdir(results, { recursive: true });
await fs.mkdir(baseline, { recursive: true });
// Own a local server; fail on an occupied port rather than accidentally testing another app.
const mime = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.png': 'image/png' };
const server = createServer(async (req, res) => {
  try {
    const pathname = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
    const target = path.resolve(root, '.' + (pathname === '/' ? '/index.html' : pathname));
    if (!target.startsWith(root + path.sep)) { res.writeHead(403).end(); return; }
    const data = await fs.readFile(target);
    res.writeHead(200, { 'Content-Type': mime[path.extname(target)] || 'application/octet-stream' }).end(data);
  } catch { res.writeHead(404).end(); }
});
await new Promise((resolve, reject) => { server.once('error', reject); server.listen(8765, '127.0.0.1', resolve); });
let browser;
const report = { mode: navigation ? 'navigation' : update ? 'capture' : 'compare', demoAsOf: fixture.demoAsOf, platform: process.platform, checks: [], errors: [] };
const urls = { dev: 'http://127.0.0.1:8765/', offline: pathToFileURL(path.join(root, '../preview/AX_Project_Manager.html')).href };
const click = (p, action) => p.locator(`[data-action="${action}"]`).first().click();
async function load(p, url, theme = 'linear-notion') {
  await p.goto(url);
  await expect(p.locator('#homeSearch')).toBeAttached();
  await p.evaluate(() => { if (AX_DATA.demoAsOf !== '2026-11-17') throw Error('demoAsOf mismatch'); });
  if (await p.evaluate(() => state.theme) !== theme) {
    await click(p, 'themes');
    await p.locator(`[data-action="theme"][data-value="${theme}"]`).click();
  }
  await p.addStyleTag({ content: '*,*::before,*::after{animation:none!important;transition:none!important;scroll-behavior:auto!important;caret-color:transparent!important}' });
  await p.evaluate(() => document.fonts.ready);
}
async function opened(p) {
  await click(p, 'project');
  await p.locator('.project-detail').scrollIntoViewIfNeeded();
}
async function prepare(p, state) {
  if (['project', 'episode', 'sources-bottom', 'image'].includes(state)) await opened(p);
  if (state === 'summary') {await p.locator('.summary-task-count').click();await p.locator('.summary-tasks').scrollIntoViewIfNeeded();}
  if (state === 'episode') await p.locator('.gantt-task-toggle').first().click();
  if (state === 'sources-bottom') {
    await click(p, 'project-files');
    await p.locator('.file-dialog .source-scroll').scrollIntoViewIfNeeded();
    await p.locator('.file-dialog .source-scroll').evaluate(e => { e.scrollTop = e.scrollHeight; });
    const pos = await p.locator('.file-dialog .source-scroll').evaluate(e => ({ top: e.scrollTop, max: e.scrollHeight - e.clientHeight }));
    if (pos.top <= 0 || Math.abs(pos.max - pos.top) > 1) throw Error('Source list did not scroll to bottom');
  }
  if (state === 'empty') { await p.locator('#homeSearch').fill('no-match-baseline-9x7'); await p.locator('#project-results').scrollIntoViewIfNeeded(); }
  if (state === 'review') { await click(p, 'reviews'); await click(p, 'review-task'); await p.locator('.task-review-form').first().scrollIntoViewIfNeeded(); }
  if (state === 'settings') await click(p, 'settings');
  if (state === 'image') { await click(p, 'file'); await expect(p.locator('.file-dialog img')).toBeVisible(); }
  await p.evaluate(async () => {
    await Promise.all([...document.images].map(img => img.decode()));
    await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
  });
}
function diff(a, b) {
  const x = PNG.sync.read(a), y = PNG.sync.read(b);
  if (x.width !== y.width || x.height !== y.height) throw Error('Screenshot dimensions differ');
  // Permit sub-perceptual channel rounding; require zero pixels above this color threshold.
  return pixelmatch(x.data, y.data, null, x.width, x.height, { threshold: 0.01, includeAA: true });
}
async function visual() {
  for (const [width, height] of [[1440,900], [834,1112], [390,844]]) {
    for (const theme of ['linear-notion', 'linear', 'notion', 'attio', 'airtable', 'clickup']) {
      const states = theme === 'linear-notion' ? ['home','summary','project','episode','sources-bottom','empty','review','settings','image'] : ['home','project'];
      for (const state of states) {
        const name = `${theme}-${width}x${height}-${state}.png`;
        const shots = [];
        // Avoid shared raster caches between independent screenshot pairs.
        const captureBrowser = await chromium.launch();
        try {
          for (const [kind, url] of Object.entries(urls)) {
            const context = await captureBrowser.newContext({ viewport: { width, height }, deviceScaleFactor: 1, locale: 'ko-KR', timezoneId: 'Asia/Seoul', reducedMotion: 'reduce' });
            const p = await context.newPage();
            p.on('pageerror', e => report.errors.push(`${name}/${kind}: ${e.message}`));
            await p.route('**/*', route => /^(http:\/\/127\.0\.0\.1:8765\/|file:|data:)/.test(route.request().url()) ? route.continue() : route.abort());
            await load(p, url, theme);
            await prepare(p, state);
            shots.push(await p.screenshot({ animations: 'disabled' }));
            if(kind==='dev' && state==='project' && theme==='linear-notion') {await p.evaluate(()=>window.scrollTo(0,0));await p.screenshot({path:path.join(results,`wbs-table-${width}-project.png`),fullPage:true});}
            await context.close();
          }
        } finally { await captureBrowser.close(); }
        if (update) {
          // Replace existing PNGs atomically (Windows may reject in-place writes).
          const target=path.join(baseline,name), temp=target+'.tmp';
          await fs.writeFile(temp,shots[0]);
          await fs.rename(temp,target);
        }
        const baselinePixels = diff(await fs.readFile(path.join(baseline, name)), shots[0]);
        const offlinePixels = diff(shots[0], shots[1]);
        report.checks.push({ name, baselinePixels, offlinePixels });
        if (baselinePixels || offlinePixels) {
          await fs.writeFile(path.join(results, name), shots[0]);
          report.errors.push(`${name}: baseline=${baselinePixels}, offline=${offlinePixels} pixels`);
        }
        console.log(`${name}: baseline=${baselinePixels}, offline=${offlinePixels}`);
      }
    }
  }
}
async function nav() {
  for (const [kind, url] of Object.entries(urls)) {
    const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, locale: 'ko-KR', timezoneId: 'Asia/Seoul' });
    const p = await context.newPage();
    async function check(name, fn) {
      try { const evidence = await fn(); report.checks.push({ kind, name, status: 'pass', evidence }); }
      catch (e) { report.checks.push({ kind, name, status: 'fail', evidence: e.message }); console.log(e.message); }
      console.log(`${kind}: ${name}: ${report.checks.at(-1).status}`);
    }
    await check('readable project hierarchy and centered Gantt survive wrapped rows',async()=>{
      await load(p,url);await p.evaluate(()=>{const p=projects[0],base=p.tasks[0];p.name='긴 프로젝트 이름 '.repeat(8);p.tasks=[{...base,id:'long',title:'여러 줄로 펼쳐지는 긴 태스크 이름 '.repeat(8),stage:'기획',owner:'Long English Name '.repeat(4),status:'in_progress',startDate:'2026-11-01',dueDate:'2026-11-10'},{...base,id:'done',stage:'리서치',status:'completed',startDate:'2026-11-01',dueDate:'2026-11-10'}];state.pins.clear();state.pins.add(p.id);state.project=p.id;state.summaryOpen=true;render();});
      const project=p.locator('.wbs-project-row').first();await expect(project.locator('.progress-percent')).toHaveText('50%');await expect(project.locator('.progress-detail')).toHaveText('1/2 완료');await expect(project.locator('.wbs-progress .tag')).toHaveCount(0);await expect(p.locator('.behind-chip,.results-count')).toHaveCount(0);expect(await project.locator('.wbs-project-name .stage-chip').count()).toBe(2);
      for(const width of [1440,834,390]){await p.setViewportSize({width,height:1000});const geometry=await p.evaluate(()=>{const row=document.querySelector('.wbs-project-row'),bar=row.querySelector('.timeline-summary'),task=document.querySelector('[data-gantt-task="long"]'),taskBar=task.querySelector('.task-gantt-bar'),dot=task.querySelector('.task-work-tick'),center=e=>{const r=e.getBoundingClientRect();return r.top+r.height/2;};return [center(bar)-center(row),center(taskBar)-center(task),dot?center(dot)-center(task):8];});expect(Math.abs(geometry[0])).toBeLessThan(1);expect(Math.abs(geometry[1]+4)).toBeLessThan(1);expect(Math.abs(geometry[2]-8)).toBeLessThan(1);}
      await p.setViewportSize({width:1440,height:900});const typography=await p.evaluate(()=>{const row=document.querySelector('.wbs-project-row'),font=s=>parseFloat(getComputedStyle(row.querySelector(s)).fontSize);const tiny=[...document.querySelectorAll('body *')].filter(e=>e instanceof HTMLElement&&!['SCRIPT','STYLE'].includes(e.tagName)&&e.getClientRects().length&&getComputedStyle(e).visibility!=='hidden'&&[...e.childNodes].some(n=>n.nodeType===Node.TEXT_NODE&&n.textContent.trim())&&parseFloat(getComputedStyle(e).fontSize)<12&&!(parseFloat(getComputedStyle(e).fontSize)===0&&!['none','normal','\"\"'].includes(getComputedStyle(e,'::after').content)&&parseFloat(getComputedStyle(e,'::after').fontSize)>=12)).map(e=>e.className);return {tiny,name:font('.wbs-project-name strong'),percent:font('.progress-percent'),detail:font('.progress-detail'),table:parseFloat(getComputedStyle(document.querySelector('.summary-tasks td')).fontSize)};});expect(typography.tiny).toEqual([]);expect(typography.name).toBeGreaterThanOrEqual(15);expect(typography.percent).toBeGreaterThan(typography.name);expect(typography.detail).toBeGreaterThanOrEqual(12);expect(typography.table).toBeGreaterThanOrEqual(13);
    });
    await check('subordinate task panel toggles, preserves state and keeps focus',async()=>{
      await load(p,url);const card=p.locator('.summary-task-count'),heading=p.locator('#summary-tasks-heading button'),panel=p.locator('#summary-tasks-panel');await expect(panel).toBeHidden();await expect(card).toHaveAttribute('aria-expanded','false');await card.focus();await p.keyboard.press('Enter');await expect(panel).toBeVisible();await expect(card).toBeFocused();await expect(heading).toHaveAttribute('aria-expanded','true');
      await p.locator('[data-action="summary-unit"][data-value="day"]').click();await p.locator('[data-action="week-person"]').nth(1).click();await expect(panel).toBeVisible();await expect(card).toHaveAttribute('aria-expanded','true');await heading.focus();await p.keyboard.press('Space');await expect(panel).toBeHidden();await expect(heading).toBeFocused();await expect(card).toHaveAttribute('aria-expanded','false');
      expect(await p.locator('.summary-tasks').evaluate(e=>e.parentElement.classList.contains('weekly-section')&&e.previousElementSibling.classList.contains('weekly-layout'))).toBe(true);
    });
    await check('stage and pin styles do not vary by state',async()=>{
      await load(p,url);await p.evaluate(()=>{const p=projects[0],base=p.tasks[0];p.tasks=[{...base,id:'research',stage:'리서치',status:'completed'},{...base,id:'planning',stage:'기획',status:'in_progress',startDate:'2026-11-01'},{...base,id:'prototype',stage:'프로토타입',status:'in_progress',startDate:'2026-12-01'}];state.pins.clear();render();});
      const styles=await p.locator('.project-signals .stage-chip').evaluateAll(els=>els.map(e=>{const c=getComputedStyle(e);return JSON.stringify([c.backgroundColor,c.color,c.borderWidth,c.opacity,c.padding]);}));expect(new Set(styles).size).toBe(1);await expect(p.locator('.stage-chip[data-status]')).toHaveCount(0);await expect(p.locator('.project-next')).toHaveCount(0);
      const equal=await p.evaluate(()=>{const id=projects[0].id,read=()=>{const e=document.querySelector('.project-pin[data-id="'+id+'"]'),c=getComputedStyle(e);return JSON.stringify([e.innerHTML,c.backgroundColor,c.color,c.borderRadius]);};const before=read();togglePin(id);render();return before===read();});expect(equal).toBe(true);await expect(p.locator('.project-pin[aria-pressed="true"]').first()).toHaveAttribute('title','고정됨');
      await p.evaluate(()=>{localStorage.removeItem(pinKey);state.pins.clear();render();});
    });
    await check('period table, folder pin and status filters', async () => {
      await load(p,url);await p.locator('.summary-task-count').click();
      for(const actionName of ['summary-status','project-status']){
        const chips=p.locator('[data-action="'+actionName+'"]');
        await expect(chips).toHaveCount(7);
        const counts=await chips.evaluateAll(els=>els.map(el=>({value:el.dataset.value,count:Number(el.querySelector('span').textContent)})));
        expect(counts.filter(c=>c.value!=='all').reduce((n,c)=>n+c.count,0)).toBe(counts.find(c=>c.value==='all').count);
        await p.locator('[data-action="'+actionName+'"][data-value="undated"]').click();
        await expect(p.locator('[data-action="'+actionName+'"][data-value="undated"]')).toHaveAttribute('aria-pressed','true');
        await p.locator('[data-action="'+actionName+'"][data-value="all"]').click();
      }
      const id=await p.locator('.project-pin').first().getAttribute('data-id');
      const pin=p.locator('.project-pin[data-id="'+id+'"]');
      await pin.focus();await p.keyboard.press('Enter');await expect(pin).toHaveAttribute('aria-pressed','true');
      await pin.click();await expect(pin).toHaveAttribute('aria-pressed','false');
      await expect(p.locator('.summary-task-row').first()).toBeVisible();
      await p.locator('.summary-task-row').first().focus();await p.keyboard.press('Enter');
      await expect(p.locator('.task-drawer')).toBeVisible();
      for(const label of ['계획 기간','실제 작업 기간','완료일','기한 준수'])await expect(p.locator('.task-properties dt').filter({hasText:label})).toHaveCount(1);
      await p.locator('.task-drawer button[data-action="drawer-close"]').click();
      for(const unit of ['day','week','month']){
        await p.locator('[data-action="summary-unit"][data-value="'+unit+'"]').click();
        const expected=await p.evaluate(()=>Math.min(periodTasks().length,state.summaryLimit));
        await expect(p.locator('.summary-task-row')).toHaveCount(expected);
      }
      await p.evaluate(()=>{projects[0].tasks[0].status='completed';render();});
      await p.locator('[data-action="summary-status"][data-value="completed"]').click();
      await expect(p.locator('.summary-task-row .plan-status:not(.completed)')).toHaveCount(0);
      await p.locator('[data-action="project-status"][data-value="completed"]').click();
      await click(p,'projects-all');
      await expect(p.locator('[data-gantt-task] .expand-chevron')).toHaveCount(0);
      await expect(p.locator('[data-gantt-task] .plan-status:not(.completed)')).toHaveCount(0);
    });
    await check('home timeline expands and preserves filter', async () => {
      await load(p,url); await expect(p.locator('.project-right-rail')).toHaveCount(0);
      const row=p.locator('.unified-toggle').first(); await row.click(); await expect(row).toHaveAttribute('aria-expanded','true');
      await expect(p.locator('.project-detail')).toBeVisible(); await row.click(); await expect(p.locator('.project-detail')).toHaveCount(0);
      await p.locator('.unified-timeline .timeline-summary').first().click(); await expect(p.locator('.project-detail')).toBeVisible();
    });
    await check('core and operations, pins and stages',async()=>{
      await load(p,url);
      await p.evaluate(()=>{projects[1].kind='ops';const base=projects[0].tasks[0];projects[0].tasks=[{...base,id:'stage-task',title:'5.1 단계 업무',wbsCode:'5.1',stage:'기획',status:'in_progress',startDate:'2026-11-01',dueDate:'2026-11-30'}];render();});
      await expect(p.locator('[data-kind="core"] > h2')).toContainText('핵심 프로젝트');
      await expect(p.locator('#ops-projects')).toBeVisible();
      await expect(p.locator('[data-action="ops-toggle"]')).toHaveCount(0);
      const pinned=await p.evaluate(()=>projects.at(-1).id);
      await p.locator('[data-action="project-pin"][data-id="'+pinned+'"]').click();
      await expect(p.locator('[data-kind="core"] .project-pin').first()).toHaveAttribute('data-id',pinned);
      await expect(p.locator('.stage-chip').first()).toHaveText('기획');
      const id=await p.evaluate(()=>projects[0].id);await p.locator('.unified-toggle[data-id="'+id+'"]').click();
      await expect(p.locator('[data-gantt-task="stage-task"] .gantt-task-copy')).toHaveText('단계 업무');
      await p.locator('[data-gantt-task="stage-task"] .gantt-task-toggle').click();
      await expect(p.locator('.task-properties')).toContainText('단계기획');
      await expect(p.locator('.task-properties')).toContainText('WBS 번호5.1');
      await p.reload();await expect(p.locator('[data-action="project-pin"][data-id="'+pinned+'"]').first()).toHaveAttribute('aria-pressed','true');
      await p.evaluate(()=>{localStorage.removeItem(pinKey);state.pins.clear();render();});
    });
    await check('monthly WBS rows align and expand at mobile width', async () => {
      await load(p,url); await p.setViewportSize({width:390,height:844});
      await p.evaluate(()=>{
        const p=projects[0], base=p.tasks[0];
        p.tasks=[{...base,id:'wbs-ten',planSource:'wbs',wbsCode:'1.10',status:'completed',startDate:'2026-11-10',dueDate:'2026-11-12'},
          {...base,id:'wbs-two',planSource:'wbs',wbsCode:'1.2.1',wbsGroups:['1 플랫폼','1.2 비교평가'],status:'in_progress',startDate:'2026-11-01',dueDate:'2026-11-03'}];
        state.project=p.id;state.expanded.clear();render();
      });
      expect(await p.locator('[data-gantt-task]').evaluateAll(rows=>rows.map(r=>r.dataset.ganttTask))).toEqual(['wbs-two','wbs-ten']);
      const projectId=await p.evaluate(()=>projects[0].id);
      expect(await p.locator(`.timeline-summary[data-id="${projectId}"] .summary-fill`).evaluate(e=>e.style.width)).toBe('50%');
      expect(await p.locator('[data-gantt-task="wbs-two"] .gantt-task-copy').evaluate(e=>getComputedStyle(e).paddingLeft)).toBe('4px');
      expect(await p.locator(`.unified-toggle[data-id="${projectId}"] .wbs-period`).textContent()).toBe('11/1–11/12');
      const bar=p.locator('[data-gantt-task="wbs-ten"] .task-gantt-bar');
      expect(await bar.evaluate(e=>({left:e.style.left,width:e.style.width}))).toEqual({left:'30%',width:'10%'});
      await expect(bar).toHaveAttribute('title','계획 11/10–11/12');
      await expect(bar.locator('.gantt-bar-label')).toHaveCount(0);
      await p.locator('[data-gantt-task="wbs-two"] .gantt-task-toggle').click();
      await expect(p.locator('.task-drawer .drawer-entry').first()).toBeVisible();
      await expect(p.locator('.project-detail .work-section')).toHaveCount(0);
      expect(await p.evaluate(()=>document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
      await p.keyboard.press('Escape');await expect(p.locator('.task-drawer')).toHaveCount(0);
      await p.locator('[data-gantt-task="wbs-two"]').screenshot({path:path.join(results,'wbs-mobile-row.png')});
      await p.setViewportSize({width:1440,height:900});
    });
    await check('core and operations share flat rows; plan hierarchy remains in the drawer',async()=>{
      await load(p,url);const equal=await p.evaluate(()=>{const p=projects[0],base=p.tasks[0];p.tasks=[{...base,id:'root-nine',title:'최상위 말단',stage:undefined,wbsCode:'9',wbsGroups:[]},{...base,id:'leaf',title:'평평한 태스크',stage:undefined,wbsCode:'2.1.1',wbsGroups:['2 플랫폼','2.1 비교'],owner:'Jason Serngwoon Choi'}];p.kind='core';const first=taskTimeline(p,M.monthRange(AX_DATA.demoAsOf));p.kind='ops';const second=taskTimeline(p,M.monthRange(AX_DATA.demoAsOf));state.project=p.id;render();return first===second;});expect(equal).toBe(true);
      await expect(p.locator('.wbs-group-row,.wbs-group-summary,[data-gantt-group]')).toHaveCount(0);await expect(p.locator('[data-gantt-task="leaf"]')).toBeVisible();expect(await p.locator('[data-gantt-task="leaf"]').evaluate(e=>e.getBoundingClientRect().height)).toBeLessThanOrEqual(44);await p.locator('[data-gantt-task="leaf"] .gantt-task-toggle').click();await expect(p.locator('.task-properties')).toContainText('계획 문서 묶음플랫폼 / 비교');await expect(p.locator('.task-properties')).toContainText('WBS 번호2.1.1');await p.keyboard.press('Escape');
    });
    await check('compact timeline columns fit long names and five named avatars',async()=>{await load(p,url);await checkTimelineColumns(p);});
    await check('summary header and bounded resource cards remain readable',async()=>{await load(p,url);await checkSummaryResources(p);});
    await check('original theme colors remain intact and the adjoining summary panel is separated',async()=>{await load(p,url);await checkSummaryBoundary(p);});
    await check('shared design scale keeps names whole and the last owner row visible',async()=>{
      await load(p,url);await p.evaluate(()=>{const names=['Heechang Lee','Jason Serngwoon Choi','Eunju Ji','박성진'];projects.forEach(p=>p.tasks.forEach((t,i)=>{t.owner=names[i%names.length];t.subtasks.forEach((w,j)=>w.owner=names[j%names.length]);}));state.project=projects[0].id;state.summaryOpen=true;render();});
      await expect(p.locator('.weekly-owner-table tbody tr')).toHaveCount(4);
      for(const width of [1440,834,390]){await p.setViewportSize({width,height:1000});await checkWeeklyLayout(p);const info=await p.evaluate(()=>{const owner=document.querySelector('.weekly-owner-table tbody th[title="Heechang Lee"]'),range=document.createRange();range.setStart(owner.firstChild,0);range.setEnd(owner.firstChild,8);const last=document.querySelector('.weekly-owner-table tbody tr:last-child'),visual=document.querySelector('.weekly-visual');return {rects:range.getClientRects().length,last:last.getBoundingClientRect().bottom,frame:visual.getBoundingClientRect().bottom,layout:visual.closest('.weekly-layout').getBoundingClientRect().bottom};});expect(info.rects).toBe(1);expect(info.last).toBeLessThanOrEqual(info.frame);}
      await p.setViewportSize({width:1440,height:900});await expect(p.locator('[data-gantt-task] .task-status').first()).toBeVisible();const metrics=await p.evaluate(()=>{const row=document.querySelector('[data-gantt-task]'),dot=row.querySelector('.status-dot'),status=row.querySelector('.task-status'),title=row.querySelector('.gantt-task-copy strong'),owner=row.querySelector('.wbs-owner');return {dot:dot.getBoundingClientRect().width,title:getComputedStyle(title).fontSize,weight:getComputedStyle(title).fontWeight,owner:getComputedStyle(owner).whiteSpace,status:getComputedStyle(status).backgroundColor};});expect(metrics).toEqual({dot:8,title:'13px',weight:'400',owner:'nowrap',status:'rgba(0, 0, 0, 0)'});
      for(const theme of ['linear-notion','linear','notion','attio','airtable','clickup']){await p.evaluate(theme=>{state.theme=theme;render();},theme);const style=await p.locator('.weekly-person-tabs button[aria-pressed="true"]').evaluate(e=>{const c=getComputedStyle(e);return [c.height,c.fontSize,c.fontWeight,c.backgroundColor,c.color];});expect(style).toEqual(['32px','14px','500','rgb(65, 70, 75)','rgb(255, 255, 255)']);}
    });
    await check('open-ended WBS and description remain clear',async()=>{
      await load(p,url);
      await p.evaluate(()=>{
        const p=projects[0],base=p.tasks[0];p.tasks=[{...base,id:'open-task',planSource:'wbs',startDate:'2026-11-04',dueDate:undefined,status:'in_progress',description:'어떤 업무인지 설명 <안전>',summary:'산출물: 채용 계획',detail:''}];
        state.project=p.id;render();
      });
      const row=p.locator('[data-gantt-task="open-task"]');
      await expect(row.locator('.wbs-period')).toHaveText('11/4 ~ 종료일 미정');
      await expect(row.locator('.gantt-task-copy')).toHaveAttribute('title',/어떤 업무인지 설명/);
      await expect(row.locator('.is-open-ended')).toHaveAttribute('title','계획 11/4–11/17');
      const projectId=await p.evaluate(()=>projects[0].id);
      await expect(p.locator('.unified-toggle[data-id="'+projectId+'"] .wbs-period')).toHaveText('11/4 ~ 진행 중');
      expect(await row.locator('.task-gantt-bar').evaluate(e=>parseFloat(e.style.width))).toBeCloseTo(14/30*100);
      await row.locator('.gantt-task-toggle').click();
      await expect(p.locator('.task-description')).toHaveText('어떤 업무인지 설명 <안전>');
      await expect(p.locator('.task-properties')).toContainText('11/4 ~ 종료일 미정');
      await expect(p.locator('.task-properties')).not.toContainText('산출물:');
      await expect(p.locator('.task-properties')).toContainText('채용 계획');
      await expect(p.locator('.drawer-notice')).toHaveCount(0);
      await p.screenshot({path:path.join(results,'open-ended-description-'+kind+'.png')});
      await p.keyboard.press('Escape');
      await p.evaluate(()=>{projects[0].tasks[0].description=undefined;render();});
      await row.locator('.gantt-task-toggle').click();await expect(p.locator('.task-description')).toHaveCount(0);
      await p.keyboard.press('Escape');
    });
    await check('task drawer: document, keyboard, navigation, sources and responsive sheet',async()=>{
      await load(p,url);await opened(p);
      const rows=p.locator('.gantt-task-toggle'),first=rows.first(),task=await first.getAttribute('data-task');
      await first.click();const drawer=p.locator('.task-drawer');await expect(drawer).toBeVisible();await expect(p.locator('#task-drawer-title')).toBeFocused();
      await expect(p.locator('.gantt-task-details')).toHaveCount(0);await expect(p.locator('.task-properties')).not.toContainText('계획 출처');
      await expect(p.locator('.drawer-day').first()).toBeVisible();expect((await drawer.boundingBox()).width).toBe(520);
      const controls=drawer.locator('button:not([disabled]),a[href]');await p.keyboard.press('Shift+Tab');await expect(controls.last()).toBeFocused();await p.keyboard.press('Tab');await expect(controls.first()).toBeFocused();
      const title=await p.locator('#task-drawer-title').textContent();await p.locator('[data-action="drawer-step"][data-step="1"]').click();await expect(p.locator('#task-drawer-title')).not.toHaveText(title);await p.locator('[data-action="drawer-step"][data-step="-1"]').click();await expect(p.locator('#task-drawer-title')).toHaveText(title);
      await rows.nth(1).click();await expect(p.locator('.task-drawer')).toHaveCount(1);await expect(rows.nth(1)).toHaveAttribute('aria-expanded','true');await first.click();
      const file=drawer.locator('[data-action="file"]:not([disabled])').first();if(await file.count()){await file.click();await expect(p.locator('.file-dialog')).toBeVisible();await p.keyboard.press('Escape');await expect(p.locator('.file-dialog')).toHaveCount(0);await expect(file).toBeFocused();}
      await p.screenshot({path:path.join(results,'drawer-1440-'+kind+'.png')});await p.keyboard.press('Escape');await expect(drawer).toHaveCount(0);await expect(first).toBeFocused();
      await first.click();await p.locator('.page-heading h1').click();await expect(drawer).toHaveCount(0);
      await p.setViewportSize({width:390,height:844});await first.click();await expect(drawer).toBeVisible();expect((await drawer.boundingBox()).width).toBe(390);await p.screenshot({path:path.join(results,'drawer-390-'+kind+'.png')});await p.locator('.task-drawer [data-action="drawer-close"]').click();await expect(drawer).toHaveCount(0);await expect(first).toBeFocused();await p.setViewportSize({width:1440,height:900});
    });
    await check('WBS table columns, row density and expand all',async()=>{
      await load(p,url);await p.locator('[data-action="projects-all"]').click();
      expect(await p.locator('.wbs-project-row .unified-toggle[aria-expanded="true"]').count()).toBe(await p.evaluate(()=>filtered().length));
      expect(await p.locator('.wbs-column-head>span').allTextContents()).toEqual(['이름','담당','기간','진척 / 상태']);
      expect(await p.locator('.wbs-project-row').first().evaluate(e=>e.getBoundingClientRect().height)).toBeGreaterThanOrEqual(56);
      await p.locator('[data-action="projects-all"]').click();await expect(p.locator('.wbs-expanded')).toHaveCount(0);
    });
    await check('top people filter derives from data', async () => {
      await load(p,url); const names=await p.evaluate(()=>M.owners(projects));
      expect(await p.locator('.heading-people button > span:last-child').allTextContents()).toEqual(names);
      await p.locator('.heading-people button').first().click(); await expect(p.locator('#ownerFilter')).toHaveValue(names[0]);
      await expect(p.locator('.heading-people button').first()).toHaveAttribute('aria-pressed','true');
    });
    await check('summary units and heatmap keyboard date selection', async () => {
      await load(p,url);
      for(const [unit,title] of [['day','하루의 업무'],['month','한 달의 업무'],['week','한 주의 업무']]) {
        await p.locator('[data-action="summary-unit"][data-value="'+unit+'"]').click(); await expect(p.locator('#weekly-heading')).toHaveText(title);
        await expect(p.locator('[data-action="week"][data-step="1"]')).toBeDisabled();
        await p.locator('[data-action="week"][data-step="-1"]').click(); await expect(p.locator('#weekSelect')).toHaveValue('-1');
      }
      const last=p.locator('.heatmap-cell[data-action]').last(); await last.focus(); await p.keyboard.press('ArrowLeft');
      const selected=await p.locator('.heatmap-cell:focus').getAttribute('data-value'); await p.keyboard.press('Enter');
      await expect(p.locator('#weekly-heading')).toHaveText('하루의 업무');
      expect(await p.evaluate(()=>week().start)).toBe(selected);
      await expect(p.locator('.heatmap-cell[tabindex="0"]')).toHaveCount(1);
    });
    await check('folder preview switches files, traps focus and returns to launcher', async () => {
      await load(p,url); await opened(p);
      await p.evaluate(()=>{const p=projects.find(p=>p.id===state.project);p.files.slice(0,2).forEach((f,i)=>Object.assign(f,{name:'합성 폴더 자료 '+i+' & #',folderId:'synthetic-folder',folderPath:['AX_TF','합성 자료'],folderUrl:'https://drive.google.com/drive/folders/synthetic',url:'https://docs.google.com/document/d/synthetic-'+i}));AX_DATA.folders={'synthetic-folder':[...p.files.slice(0,2).map(f=>({id:f.id,name:f.name,url:f.url,kind:'document',linked:true})),{id:'unlinked',name:'미연결 합성 파일',url:'https://drive.google.com/file/d/unlinked',kind:'document',linked:false}]};render();});
      const ids=await p.evaluate(()=>projects.find(p=>p.id===state.project).files.slice(0,2).map(f=>f.id));
      const launcher=p.locator('[data-action="file"][data-file="'+ids[0]+'"]').last();await launcher.click();
      await expect(p.locator('.folder-breadcrumb')).toContainText('합성 자료');await expect(p.locator('.file-dialog footer a')).toHaveAttribute('href','https://drive.google.com/drive/folders/synthetic');
      await expect(p.locator('.folder-browser>p')).toHaveText('이 폴더의 파일 3개 · 연결된 자료 2개');
      await expect(p.locator('.folder-files .unlinked a')).toHaveAttribute('href','https://drive.google.com/file/d/unlinked');
      await expect(p.locator('.folder-files .unlinked a')).toHaveAttribute('target','_blank');
      await expect(p.locator('.folder-files small').filter({hasText:'연결됨'})).toHaveCount(2);
      await expect(p.locator('.folder-files [aria-current=true]')).toContainText('현재 자료');
      await expect(p.locator('.file-dialog footer a')).toHaveCount(1);await expect(p.locator('.folder-search,.folder-open')).toHaveCount(0);
      const next=p.locator('.folder-files a').filter({hasText:'합성 폴더 자료 1'});await expect(next).toHaveAttribute('href','https://docs.google.com/document/d/synthetic-1');await expect(next).toHaveAttribute('target','_blank');
      await expect(p.locator('.file-dialog')).toHaveCount(1);
      const controls=p.locator('.file-dialog a,.file-dialog button');await controls.last().focus();await p.keyboard.press('Tab');await expect(controls.first()).toBeFocused();await p.keyboard.press('Shift+Tab');await expect(controls.last()).toBeFocused();
      await p.keyboard.press('Escape');await expect(p.locator('.file-dialog')).toHaveCount(0);await expect(launcher).toBeFocused();
    });
    await check('current folder file scrolls into view and respects reduced motion', async () => {
      await load(p,url);await opened(p);
      await p.evaluate(()=>{const project=projects.find(p=>p.id===state.project),f=project.files[0];Object.assign(f,{name:'ZZ current',folderId:'scroll-test',folderPath:['합성'],folderUrl:'https://drive.google.com/drive/folders/test'});AX_DATA.folders={'scroll-test':[...Array.from({length:40},(_,i)=>({id:'extra-'+i,name:'AA '+i,linked:false})),{id:f.id,name:f.name,linked:true}]};state.modal={project:project.id,file:f.id};render();});
      const row=p.locator('.folder-files [aria-current=true]');
      expect(await row.evaluate(e=>{const list=e.closest('.folder-files'),a=e.getBoundingClientRect(),b=list.getBoundingClientRect();return list.scrollTop>0&&a.top>=b.top&&a.bottom<=b.bottom+1})).toBe(true);
      // load() suppresses animations for screenshots; remove that override for this motion check.
      await p.evaluate(()=>document.querySelectorAll('style').forEach(n=>{if(n.textContent.includes('caret-color:transparent!important'))n.remove();}));
      await p.emulateMedia({reducedMotion:'no-preference'});await p.evaluate(()=>render());
      await expect.poll(()=>row.evaluate(e=>getComputedStyle(e).animationDuration)).toBe('2s');
      await p.emulateMedia({reducedMotion:'reduce'});await expect.poll(()=>row.evaluate(e=>getComputedStyle(e).animationName)).toBe('none');
      await p.emulateMedia({reducedMotion:'no-preference'});
    });
    await check('/ search focus', async () => {
      await load(p,url); await p.keyboard.press('/'); await expect(p.locator('#homeSearch')).toBeFocused();
      expect(await p.locator('#homeSearch').evaluate(e => getComputedStyle(e).outlineStyle)).not.toBe('none');
      await p.locator('.page-heading h1').click();
      await expect(p.locator('body')).not.toHaveAttribute('data-keyboard-navigation');
    });
    await check('Tab / Shift+Tab home order', async () => {
      await load(p,url); await p.locator('.brand').focus();
      await p.keyboard.press('Tab'); await expect(p.locator('.review-trigger')).toBeFocused();
      await p.keyboard.press('Tab'); await expect(p.locator('.settings-trigger')).toBeFocused();
      await p.keyboard.press('Shift+Tab'); await expect(p.locator('.review-trigger')).toBeFocused();
      return 'brand → review → settings → review';
    });
    await check('Enter / Space activation', async () => {
      await load(p,url); await p.locator('.settings-trigger').focus(); await p.keyboard.press('Enter'); await expect(p.locator('.settings-dialog')).toBeVisible();
      await p.keyboard.press('Escape'); await p.keyboard.press('Space'); await expect(p.locator('.settings-dialog')).toBeVisible();
    });
    for (const type of ['settings','reviews','file','themes']) {
      async function open() { await load(p,url); if (type === 'file') await opened(p); await click(p,type); }
      const dialog = type === 'themes' ? '.theme-menu' : '[aria-modal="true"]';
      await check(`${type}: entry focus`, async () => { await open(); expect(await p.locator(dialog).evaluate(e => e.contains(document.activeElement))).toBe(true); });
      await check(`${type}: Escape and focus return`, async () => {
        await open(); await p.keyboard.press('Escape'); await expect(p.locator(dialog)).toHaveCount(0);
        await expect(p.locator(`[data-action="${type}"]`).first()).toBeFocused();
      });
      await check(`${type}: background focus / Tab trap`, async () => {
        await open();
        await p.locator('.brand').evaluate(e => e.focus());
        expect(await p.locator(dialog).evaluate(e => e.contains(document.activeElement))).toBe(true);
        const buttons = p.locator(`${dialog} button`);
        await buttons.last().focus(); await p.keyboard.press('Tab'); await expect(buttons.first()).toBeFocused();
        await p.keyboard.press('Shift+Tab'); await expect(buttons.last()).toBeFocused();
      });
    }
    await check('topic arrows both directions', async () => {
      await load(p,url,'notion'); await opened(p); await p.locator('[role="tab"][data-value="topic"]').focus();
      await p.keyboard.press('ArrowRight'); await expect(p.locator('[role="tab"][data-value="episode"]')).toBeFocused();
      await expect(p.locator('.execution-episodes')).toBeVisible();
      await p.keyboard.press('ArrowLeft'); await expect(p.locator('[role="tab"][data-value="topic"]')).toBeFocused();
    });
    await check('browser back', async () => {
      await load(p,url); await opened(p); await expect(p.locator('.project-detail')).toBeVisible(); await p.goBack(); await expect(p.locator('.project-detail')).toHaveCount(0);
    });
    await check('source scroll persists both views', async () => {
      await load(p,url,'notion'); await opened(p);
      const sources = p.locator('.source-scroll'); await sources.evaluate(e => { e.scrollTop = e.scrollHeight; });
      const top = await sources.evaluate(e => e.scrollTop); expect(top).toBeGreaterThan(0);
      for (const tab of ['episode','topic']) { await p.locator(`[data-action="tab"][data-value="${tab}"]`).click(); expect(await sources.evaluate(e => e.scrollTop)).toBe(top); }
      return `scrollTop=${top}`;
    });
    await check('theme survives reload', async () => {
      await load(p,url,'notion'); await expect(p.locator('body')).toHaveAttribute('data-theme','notion');
      expect(await p.evaluate(() => localStorage.getItem('ax_theme'))).toBe('notion');
      await p.reload(); await expect(p.locator('body')).toHaveAttribute('data-theme','notion', { timeout: 1000 });
    });
    await check('invalid / absent / inaccessible storage uses initial theme', async () => {
      for (const value of [null, 'invalid-theme']) {
        await p.evaluate(value => value === null ? localStorage.removeItem('ax_theme') : localStorage.setItem('ax_theme', value), value);
        await p.reload();
        await expect(p.locator('body')).toHaveAttribute('data-theme', 'linear');
        await expect(p.locator('body')).toHaveAttribute('data-palette', 'notion');
      }
      const isolated = await context.newPage();
      await isolated.addInitScript(() => Object.defineProperty(window, 'localStorage', { get() { throw new Error('storage unavailable'); } }));
      await isolated.goto(url);
      await expect(isolated.locator('body')).toHaveAttribute('data-palette', 'notion');
      await isolated.close();
    });
    for (const type of ['settings', 'reviews', 'file', 'themes']) {
      await check(`${type}: skip link blocked / slash contained / close return`, async () => {
        await load(p, url); if (type === 'file') await opened(p);
        const launcher = p.locator(`[data-action="${type}"]`).nth(type === 'file' ? 1 : 0);
        await launcher.focus(); await p.keyboard.press('Enter');
        const dialog = p.locator('[aria-modal="true"]');
        await p.locator('.skip-link').evaluate(e => e.focus());
        expect(await dialog.evaluate(e => e.contains(document.activeElement))).toBe(true);
        await p.keyboard.press('/');
        expect(await dialog.evaluate(e => e.contains(document.activeElement))).toBe(true);
        const closing = type === 'themes' ? p.locator('[data-action="theme"]').last() : dialog.locator('[data-action="close"]');
        await closing.focus(); await p.keyboard.press('Space');
        await expect(launcher).toBeFocused();
      });
    }
    await check('keyboard summary / selects / filter focus continuity', async () => {
      await load(p, url);
      const summary = p.locator('summary').first();
      await summary.focus(); await p.keyboard.press('Enter');
      await expect(p.locator('details').first()).toHaveAttribute('open', '');
      await p.keyboard.press('Space'); await expect(p.locator('details').first()).not.toHaveAttribute('open', '');
      for (const id of ['weekSelect', 'ownerFilter']) {
        const select = p.locator(`#${id}`); await select.focus();
        await p.keyboard.press('ArrowDown'); await p.keyboard.press('Enter'); await expect(select).toBeFocused();
        expect(await select.inputValue()).not.toBe(id === 'weekSelect' ? '0' : '전체');
      }
      const owner = p.locator('[data-action="owner"]').first(); await owner.focus(); await p.keyboard.press('Space');
      await expect(owner).toBeFocused();
    });
    await check('Airtable view / fields / grouping keyboard continuity', async () => {
      await load(p, url, 'airtable');
      for (const action of ['fields', 'group']) {
        const control = p.locator(`[data-action="${action}"]`); await control.focus(); await p.keyboard.press('Space');
        await expect(control).toHaveAttribute('aria-pressed', 'true'); await expect(control).toBeFocused();
      }
      for (const view of ['gallery', 'timeline', 'grid']) {
        const control = p.locator(`[data-action="airview"][data-value="${view}"]`); await control.focus(); await p.keyboard.press('Enter');
        await expect(control).toHaveClass(/active/); await expect(control).toBeFocused();
      }
    });
    for (const [width, height] of [[1440,900], [834,1112], [390,844]]) {
      await p.setViewportSize({ width, height });
      for (const theme of ['linear-notion','linear','notion','attio','airtable','clickup']) {
        await check(`full Tab order / keyboard focus ${theme} ${width}x${height}`, async () => {
          // Reset storage explicitly: load() otherwise correctly preserves the last chosen theme.
          await p.evaluate(() => localStorage.removeItem('ax_theme'));
          await load(p, url, theme); await opened(p);
          await p.locator('[data-action="task"]').first().focus(); await p.keyboard.press('Enter');
          if (theme === 'linear' || theme === 'linear-notion') {
            await expect(p.locator('.task-drawer')).toBeVisible();
            await expect(p.locator('#task-drawer-title')).toBeFocused();
            await p.keyboard.press('Escape');await expect(p.locator('.task-drawer')).toHaveCount(0);
            await expect(p.locator('[data-action="task"]').first()).toBeFocused();
          } else await expect(p.locator('.task-expanded')).toBeVisible();
          await p.locator('summary').first().focus(); await p.keyboard.press('Space');
          const candidates = p.locator('a[href],button,input,select,summary,[tabindex="0"]');
          const indices = await candidates.evaluateAll(els => els.flatMap((e, i) =>
            e.tabIndex >= 0 && !e.disabled && e.checkVisibility() && !e.closest('[inert]') ? [i] : []));
          const expected = await candidates.evaluateAll((els, indices) => indices.map(i => [...document.querySelectorAll('*')].indexOf(els[i])), indices);
          await candidates.nth(indices[0]).focus();
          const visited = [expected[0]], all = p.locator('*');
          // Chromium also tabs to scroll containers without explicit tabindex.
          while (visited.at(-1) !== expected.at(-1)) {
            await p.keyboard.press('Tab');
            const i = await p.evaluate(() => [...document.querySelectorAll('*')].indexOf(document.activeElement));
            expect(i, 'forward DOM order, including native scroll containers').toBeGreaterThan(visited.at(-1));
            expect(visited.length).toBeLessThan(300);
            visited.push(i);
            const visible = await all.nth(i).evaluate(e => {
              const r = e.getBoundingClientRect(), s = getComputedStyle(e);
              return s.outlineStyle !== 'none' && r.bottom > 0 && r.top < innerHeight && r.right > 0 && r.left < innerWidth;
            });
            expect(visible, `keyboard focus visible at control ${i}`).toBe(true);
          }
          expect(visited.filter(i => expected.includes(i))).toEqual(expected);
          for (const i of visited.slice(0, -1).reverse()) {
            await p.keyboard.press('Shift+Tab'); await expect(all.nth(i)).toBeFocused();
          }
          return `${indices.length} controls, DOM order forward/reverse; home + expanded task + summary + sources + timeline`;
        });
      }
    }
    await context.close();
  }
}
try {
  browser = await chromium.launch();
  report.chromium = browser.version();
  if (navigation) await nav(); else await visual();
  if (update && !report.errors.length) {
    const files = await Promise.all(report.checks.map(async ({ name }) => ({
      name, sha256: createHash('sha256').update(await fs.readFile(path.join(baseline, name))).digest('hex')
    })));
    await fs.writeFile(path.join(baseline, 'manifest.json'), JSON.stringify({ chromium: report.chromium, playwright: '1.65.1', platform: process.platform, demoAsOf: fixture.demoAsOf, files }, null, 2) + '\n');
  }
} catch (e) { report.errors.push(e.stack); }
finally {
  await browser?.close();
  await new Promise(resolve => server.close(resolve));
  await fs.writeFile(path.join(results, navigation ? 'navigation.json' : 'visual.json'), JSON.stringify(report, null, 2));
}
console.log(JSON.stringify({ checks: report.checks.length, failures: report.checks.filter(c => c.status === 'fail').length, errors: report.errors.length }));
// Both navigation failures and visual mismatches fail the gate.
if (report.errors.length || report.checks.some(c => c.status === 'fail')) process.exitCode = 1;
if(navigation&&!process.exitCode)await import('./correction.mjs');
