import {expect} from '@playwright/test';

export async function checkSummaryResources(page){
 await page.evaluate(()=>{const p=projects[0];p.files=[{...p.files[0],name:'팀 밖 사람도 읽을 수 있는 긴 관련 자료 제목을 확인합니다 '.repeat(8),source:'Google Drive very long source metadata '.repeat(8)}];state.theme='linear-notion';state.project=p.id;render();});
 for(const width of [1440,834,390]){
  await page.setViewportSize({width,height:1000});
  await page.evaluate(()=>{state.summaryOpen=false;render();});await expect(page.locator('.summary-tasks .status-filters')).toHaveCount(0);
  await page.evaluate(()=>{state.summaryOpen=true;render();});await expect(page.locator('#summary-tasks-heading small')).toHaveCount(0);
  const heading=await page.locator('.summary-tasks .section-top').evaluate(e=>{const h=e.querySelector('h2 button'),f=e.querySelector('.status-filters'),chip=f.querySelector('button'),a=h.getBoundingClientRect(),b=f.getBoundingClientRect(),c=getComputedStyle(h),d=getComputedStyle(chip);return {size:c.fontSize,weight:c.fontWeight,chipHeight:chip.getBoundingClientRect().height,chipSize:d.fontSize,sameRow:b.left>=a.right+8,gap:b.top-a.bottom};});
  expect(heading.size).toBe('14px');expect(heading.weight).toBe('700');expect(heading.chipHeight).toBe(28);expect(heading.chipSize).toBe('13px');if(!heading.sameRow)expect(heading.gap).toBeGreaterThanOrEqual(12);
  const card=await page.locator('.gantt-resources .source-row').first().evaluate(e=>{const title=e.querySelector('strong'),meta=e.querySelector('small'),t=getComputedStyle(title),m=getComputedStyle(meta),r=e.getBoundingClientRect();return {height:r.height,clamp:t.webkitLineClamp,titleHeight:title.clientHeight,lineHeight:parseFloat(t.lineHeight),titleTruncated:title.scrollHeight>title.clientHeight,tooltip:title.title===title.textContent,metaTruncated:meta.scrollWidth>meta.clientWidth,metaOverflow:m.textOverflow,metaWhiteSpace:m.whiteSpace,inside:[title,meta].every(n=>{const b=n.getBoundingClientRect();return b.left>=r.left&&b.right<=r.right&&b.top>=r.top&&b.bottom<=r.bottom;}),scroll:e.scrollHeight,client:e.clientHeight};});
  expect(card.height).toBe(80);expect(card.clamp).toBe('2');expect(card.titleHeight).toBeLessThanOrEqual(card.lineHeight*2);expect(card.titleTruncated).toBe(true);expect(card.tooltip).toBe(true);expect(card.metaTruncated).toBe(true);expect(card.metaOverflow).toBe('ellipsis');expect(card.metaWhiteSpace).toBe('nowrap');expect(card.inside).toBe(true);expect(card.scroll).toBeLessThanOrEqual(card.client);
 }
 await page.setViewportSize({width:1440,height:900});
}
