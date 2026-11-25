import {expect} from '@playwright/test';

export async function checkWeeklyLayout(page) {
 const width=page.viewportSize().width;
 const metrics=await page.locator('.weekly-layout').evaluate(layout=>{
  const box=layout.getBoundingClientRect(),summary=layout.querySelector('.week-summary'),meta=summary.querySelector('.summary-meta'),toggle=summary.querySelector('.summary-task-count'),report=layout.querySelector('.weekly-report'),visual=layout.querySelector('.weekly-visual');
  visual.scrollTop=visual.scrollHeight;
  const last=visual.querySelector('tbody tr:last-child');
  return {height:box.height,gap:toggle.getBoundingClientRect().top-meta.getBoundingClientRect().bottom,summaryBottom:summary.getBoundingClientRect().bottom,toggleBottom:toggle.getBoundingClientRect().bottom,reportHeight:report.clientHeight,reportScroll:getComputedStyle(report).overflowY,visualScroll:getComputedStyle(visual).overflowY,lastBottom:last?.getBoundingClientRect().bottom,visualBottom:visual.getBoundingClientRect().bottom};
 });
 if(width>700)expect(metrics.height).toBe(240);
 expect(metrics.gap).toBeGreaterThanOrEqual(16);expect(metrics.gap).toBeLessThanOrEqual(16);
 expect(metrics.toggleBottom).toBeLessThanOrEqual(metrics.summaryBottom-8);
 expect(metrics.reportScroll).toBe('auto');expect(metrics.visualScroll).toBe('auto');
 expect(metrics.reportHeight).toBeLessThanOrEqual(width>700?240:320);
 if(metrics.lastBottom)expect(metrics.lastBottom).toBeLessThanOrEqual(metrics.visualBottom+1);
}
