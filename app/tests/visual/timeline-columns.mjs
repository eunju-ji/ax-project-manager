import {expect} from '@playwright/test';

export async function checkTimelineColumns(page) {
 const projectId=await page.evaluate(()=>{const p=projects[0],base=p.tasks[0],names=['Jason Serngwoon Choi','Heechang Lee','Eunju Ji','김지현','박성진','이수민','A & B'];p.owner=names[0];p.tasks=names.map((owner,i)=>({...base,id:'compact-'+i,owner,subtasks:[]}));state.project=p.id;render();return p.id;});
 const group=page.locator('.unified-toggle[data-id="'+projectId+'"] .avatar-group');
 await expect(group.locator('.avatar')).toHaveCount(5);await expect(group.locator('small')).toHaveText('+2');
 expect(await group.locator('.avatar').evaluateAll(avatars=>avatars.every(a=>!!a.title))).toBe(true);
 const overlap=await group.locator('.avatar').evaluateAll(avatars=>avatars.slice(1).every((a,i)=>a.getBoundingClientRect().left<avatars[i].getBoundingClientRect().right));expect(overlap).toBe(true);
 for(const width of [1440,1024,834]){
  await page.setViewportSize({width,height:900});
  const geometry=await page.locator('[data-gantt-task="compact-0"]').evaluate(row=>{const owner=row.querySelector('.wbs-owner'),name=owner.querySelector('span:last-child'),range=document.createRange();range.selectNodeContents(name);const o=owner.getBoundingClientRect(),n=name.getBoundingClientRect(),grid=row.closest('.timeline-grid'),lane=row.querySelector('.timeline-lane').getBoundingClientRect();return {ownerWidth:o.width,nameRight:n.right,ownerRight:o.right,lines:range.getClientRects().length,scroll:owner.scrollWidth,client:owner.clientWidth,left:lane.left-row.getBoundingClientRect().left,lane:lane.width,grid:grid.getBoundingClientRect().width};});
  expect(geometry.ownerWidth).toBeLessThan(200);expect(geometry.nameRight).toBeLessThanOrEqual(geometry.ownerRight);expect(geometry.lines).toBe(1);expect(geometry.scroll).toBeLessThanOrEqual(geometry.client);expect(geometry.left).toBeLessThan(760);expect(geometry.lane).toBeGreaterThanOrEqual(580);
 }
 await page.setViewportSize({width:1440,height:900});
}
