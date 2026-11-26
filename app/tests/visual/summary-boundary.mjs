import {expect} from '@playwright/test';

export async function checkSummaryBoundary(page){
 await page.evaluate(()=>{state.theme='linear-notion';state.summaryOpen=true;state.project=projects[0].id;projects[0].tasks[0].stage='기획';render();});
 const colors=await page.evaluate(()=>{const bg=s=>getComputedStyle(document.querySelector(s)).backgroundColor,c=getComputedStyle(document.body),panel=getComputedStyle(document.querySelector('.summary-tasks'));return {page:bg('body'),card:bg('.weekly-layout'),visual:bg('.weekly-visual'),detail:bg('.summary-tasks'),project:bg('.wbs-project-row'),stage:bg('.stage-group-row'),task:bg('.task-gantt-row'),border:panel.borderTopWidth,borderColor:panel.borderTopColor,accent:c.getPropertyValue('--accent').trim(),ink:c.getPropertyValue('--ink').trim(),muted:c.getPropertyValue('--muted').trim(),surface2:c.getPropertyValue('--surface2').trim()};});
 expect(colors).toEqual({page:'rgb(255, 255, 255)',card:'rgb(255, 255, 255)',visual:'rgb(248, 247, 245)',detail:'rgb(248, 247, 255)',project:'rgb(248, 247, 245)',stage:'rgba(0, 0, 0, 0)',task:'rgba(0, 0, 0, 0)',border:'2px',borderColor:'rgb(232, 231, 228)',accent:'#3a6db5',ink:'#302f2c',muted:'#7b7a75',surface2:'#f8f7f5'});
 const taskFill=await page.locator('.task-gantt-row>.gantt-task-toggle').first().evaluate(e=>getComputedStyle(e).backgroundColor);expect(taskFill).toBe('rgb(255, 255, 255)');
 for(const [theme,background] of [['linear','rgb(17, 18, 21)'],['layout-2','rgb(255, 255, 255)'],['layout-3','rgb(255, 255, 255)']]){await page.evaluate(theme=>{state.theme=theme;render();},theme);expect(await page.locator('body').evaluate(e=>getComputedStyle(e).backgroundColor)).toBe(background);}
 await page.evaluate(()=>{state.theme='linear-notion';render();});return colors;
}
