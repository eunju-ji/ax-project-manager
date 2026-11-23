const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const path=require('node:path');
const root=path.resolve(__dirname,'..');
function app(setup=''){
 const container={innerHTML:'',scrollIntoView(){}};
 const ctx=vm.createContext({Intl,Date,Set,Map,console,location:{hash:''},history:{pushState(){}},localStorage:{getItem(){return null},setItem(){}},window:{addEventListener(){},scrollTo(){}},document:{activeElement:null,body:{dataset:{},classList:{toggle(){}}},getElementById(){return container},querySelector(){return null},addEventListener(){}}});
 for(const file of ['data.js','src/model.js','app.js']){vm.runInContext(fs.readFileSync(path.join(root,file),'utf8'),ctx,{filename:file});if(file==='data.js'&&setup)vm.runInContext(setup,ctx);}
 return {ctx,html:()=>container.innerHTML,run:code=>vm.runInContext(code,ctx)};
}
test('reference tasks are absent from counts, progress, timeline, heatmap, summaries and people',()=>{
 const a=app(`AX_DATA.projects.push({id:'reference-only',name:'참考専用',tasks:[{id:'ref',planSource:'reference',title:'参考作業',owner:'参考担当',subtasks:[{id:'ref-log',owner:'参考担当',performedAt:'2026-11-17',title:'参考記録'}]}],files:[]});AX_DATA.projects[0].tasks.push({id:'ref-mixed',planSource:'reference',title:'参考混合',owner:'参考担当',subtasks:[{id:'ref-log2',owner:'参考担当',performedAt:'2026-11-17',title:'参考記録'}]});`);
 assert.ok(!a.run("projects.some(p=>p.id==='reference-only')"));assert.ok(!a.run("M.owners(projects).includes('参考担当')"));
 const baseline=app();
 for(const unit of ['day','week','month']){a.run(`state.summaryUnit='${unit}';render()`);baseline.run(`state.summaryUnit='${unit}';render()`);assert.doesNotMatch(a.html(),/参考/);assert.equal(a.html(),baseline.html());}
 for(const theme of ['linear','notion','attio','airtable','clickup']){const setup=`state.theme='${theme}';state.project=projects[0].id;render()`;a.run(setup);baseline.run(setup);assert.equal(a.html(),baseline.html());}
 assert.ok(!a.run("projects.flatMap(p=>p.tasks).some(t=>t.planSource==='reference')"));
});
test('merged tasks are absent from every theme, summaries, counts and drawer navigation',()=>{
 const a=app(`AX_DATA.projects[0].tasks.push({...AX_DATA.projects[0].tasks[0],id:'merged',title:'MERGED_HIDDEN',merged_into:AX_DATA.projects[0].tasks[0].id,owner:'MERGED_OWNER'});AX_DATA.projects[0].files.push({...AX_DATA.projects[0].files[0],id:'merged-file',taskId:'merged',name:'MERGED_HIDDEN'});`),baseline=app();
 assert.ok(!a.run("projects.flatMap(p=>p.tasks).some(t=>t.id==='merged')"));assert.ok(!a.run("M.owners(projects).includes('MERGED_OWNER')"));
 for(const unit of ['day','week','month']){const code=`state.summaryUnit='${unit}';render()`;a.run(code);baseline.run(code);assert.equal(a.html(),baseline.html());}
 for(const theme of ['linear-notion','linear','notion','attio','airtable','clickup']){const code=`state.theme='${theme}';state.project=projects[0].id;state.drawerTask=projects[0].tasks[0].id;render()`;a.run(code);baseline.run(code);assert.equal(a.html(),baseline.html());assert.doesNotMatch(a.html(),/MERGED_HIDDEN/);}
});

test('folder preview shows unlinked files, current and linked badges, safe encoded Drive search',()=>{
 const a=app();a.run(`const f=projects[0].files[0];Object.assign(f,{folderId:'folder',folderPath:['合成'],folderUrl:'https://drive.google.com/drive/folders/f',name:'A & #한글'});AX_DATA.folders={folder:[{id:f.id,name:f.name,url:f.url,kind:'document',linked:true},{id:'unlinked',name:'B 未接続',url:'https://drive.google.com/file/d/b',kind:'document',linked:false}]};`);
 const html=a.run('folderBrowser(projects[0].files[0])');assert.match(html,/이 폴더의 파일 2개 · 연결된 자료 1개/);assert.match(html,/현재 자료/);assert.match(html,/연결됨/);assert.match(html,/B 未接続/);
 assert.match(html,/<a href="https:\/\/drive.google.com\/file\/d\/b" target="_blank" rel="noopener noreferrer">/);assert.ok(html.indexOf('A &amp;')<html.indexOf('B 未接続'));
 assert.match(html,/href="https:\/\/drive.google.com\/file\/d\/b" target="_blank" rel="noopener noreferrer"/);
});
test('API view reload refreshes folder files and clears stale folders',async()=>{
 const a=app();a.run(`globalThis.fetch=async()=>({ok:true,json:async()=>({projects,reviews:[],taskStates:[],decisions:[],folders:{api:[{id:'unlinked',name:'API 미연결',kind:'document',linked:false}]}})});`);
 await a.run('loadLocal()');assert.equal(a.run('AX_DATA.folders.api[0].name'),'API 미연결');
 a.run(`globalThis.fetch=async()=>({ok:true,json:async()=>({projects,reviews:[],taskStates:[],decisions:[]})});`);await a.run('loadLocal()');assert.equal(a.run('Object.keys(AX_DATA.folders).length'),0);
});
test('Linear with Notion palette keeps identical project structure and uses Linear layout selectors',()=>{
 const a=app();a.run("state.theme='linear';state.project='ax';state.expanded.add('AX-07');render()");const original=a.run('projectArea()');
 a.run("state.theme='linear-notion';render()");assert.equal(a.run('projectArea()'),original);
 assert.equal(a.run('document.body.dataset.theme'),'linear');assert.equal(a.run('document.body.dataset.palette'),'notion');
 assert.ok(a.run("THEMES.some(t=>t.id==='linear-notion')"));
});
test('all five theme renderers run and include weekly view, timeline and no lifecycle controls',()=>{
 const a=app();
 for(const theme of ['linear','notion','attio','airtable','clickup']){
  a.run(`state.theme='${theme}';render()`);
  assert.match(a.html(),/한 주의 업무/);assert.match(a.html(),/작업 내역 히트맵/);
  assert.doesNotMatch(a.html(),/진행률|TO DO|IN PROGRESS|DONE/);
 }
});
test('project opens inside list; task reveals every explicit subtask and source list persists across tabs',()=>{
 const a=app();a.run("state.project='ax';state.expanded.add('AX-07');render()");
 assert.match(a.html(),/시스템 아키텍처 구조도.md/);
 assert.match(a.html(),/원본 접근 정보 명세.md/);
 const sourceCount=a.run("projects.find(p=>p.id==='ax').files.length");
 assert.equal((a.html().match(/class="source-row"/g)||[]).length,Math.min(6,sourceCount));
 assert.match(a.html(),/class="source-scroll source-cards"/);assert.doesNotMatch(a.html(),/class="more-sources"/);
 a.run("state.tab='episode';render()");assert.equal((a.html().match(/class="source-row"/g)||[]).length,Math.min(6,sourceCount));
});
test('team summary has separate person selection, week dropdown, settings, and no project-level work type filter',()=>{
 const a=app();assert.match(a.html(),/id="weekSelect"/);assert.match(a.html(),/data-action="week-person"/);
 assert.match(a.html(),/data-action="settings"/);assert.doesNotMatch(a.html(),/class="member-stack"|class="week-today|class="worktype-toolbar"/);
 assert.match(a.html(),/activity-heatmap/);assert.doesNotMatch(a.html(),/project-right-rail|>WORKSPACE</);
 const team=a.run('records().length');a.run("state.query='없는검색어';render()");assert.equal(a.run('records().length'),team);
 a.run("state.weekOwner='박성진';render()");assert.ok(a.run("records().every(r=>r.subtask.owner==='박성진')"));
});
test('people come from task and worklog owners, with worklog heatmap replacing rails',()=>{
 const a=app();assert.match(a.html(),/class="heading-people"/);assert.match(a.html(),/activity-heatmap/);
 assert.doesNotMatch(a.html(),/project-right-rail|rail-activity|rail-people/);
 assert.deepEqual(Array.from(a.run('M.owners(projects)')).sort(),['김지현','박성진','이수민'].sort());
});
test('monthly timeline is independent of selected summary week and includes today marker',()=>{
 const a=app();const before=a.run('timeline(projects)');assert.match(before,/2026년 11월/);
 assert.match(before,/class="today-line"/);assert.match(before,/1일/);assert.match(before,/30일/);
 a.run('state.week=-2');assert.equal(a.run('timeline(projects)'),before);
 a.run('state.timelineMonth=1');assert.match(a.run('timeline(projects)'),/2026년 12월/);
});
test('weekly visual distribution reconciles to actual execution records',()=>{
 const a=app();assert.match(a.html(),/class="weekly-visual"/);assert.match(a.html(),/class="work-distribution"/);
 assert.match(a.html(),/담당자별 작업/);
 const total=a.run('records().length');assert.equal(a.run('M.categories.reduce((n,c)=>n+records().filter(r=>r.task.topic===c).length,0)'),total);
});
test('execution episodes share the same timestamps and artifact sources as subtasks',()=>{
 const a=app();a.run("state.theme='notion';state.project='ax';state.tab='episode';render()");
 assert.equal((a.html().match(/class="execution-entry"/g)||[]).length,a.run("count(projects.find(p=>p.id==='ax'))"));
 assert.match(a.html(),/10:00/);assert.match(a.html(),/시스템 아키텍처 구조도.md/);
 assert.ok(a.run("projects.every(p=>p.tasks.every(t=>t.subtasks.every(s=>p.files.some(f=>f.id===s.sourceId))))"));
});
test('episodes order all dates and times newest first',()=>{
 const a=app();const markup=a.run('executionEpisodes(projects[0],projects[0].tasks)');
 const timestamps=[...markup.matchAll(/datetime="([^"]+)"/g)].map(m=>Date.parse(m[1]));
 assert.ok(timestamps.length>1);assert.deepEqual(timestamps,timestamps.slice().sort((a,b)=>b-a));
});
test('every open project has its own single-row timeline and highlighted review items',()=>{
 const a=app();for(const theme of ['linear','notion','attio','airtable','clickup']){
  a.run(`state.theme='${theme}';state.project='ax';render()`);
  // Linear themes already show the project's row in the main timeline above the detail; other themes keep their own local timeline.
  if(theme==='linear')assert.doesNotMatch(a.html(),/class="project-local-timeline"/);else assert.match(a.html(),/class="project-local-timeline"/);
  assert.match(a.html(),/class="project-review-alert"/);
 }
});
test('week change updates totals from execution records and supports empty historical weeks',()=>{
 const a=app();const current=a.run('records().length');a.run('state.week=-1;render()');
 assert.notEqual(a.run('records().length'),current);
 a.run('state.week=-100;render()');assert.equal(a.run('records().length'),0);assert.match(a.html(),/기록된 업무가 없습니다/);
});
test('combined project, category and actual executor filters and empty result state',()=>{
 const a=app();a.run("state.topic='제작·구현';state.owner='박성진';render()");
 assert.ok(a.run("filtered().every(p=>p.tasks.some(t=>t.topic==='제작·구현'&&t.subtasks.some(s=>s.owner==='박성진')))"));
 a.run("state.query='존재하지않는검색';render()");assert.match(a.html(),/검색 결과가 없습니다/);
});
test('weekly summary includes all selected owner records; review is session-only',()=>{
 const a=app();a.run("state.weekOwner='김지현';render()");assert.match(a.html(),/김지현 업무 요약/);
 assert.equal((a.run('weekly()').match(/data-action="record"/g)||[]).length,a.run('records().length'));
 const before=a.run('reviewCount()');a.run("state.reviewed.add(AX_DATA.reviews[0].id);render()");assert.equal(a.run('reviewCount()'),before-1);
});
test('settings exposes integration preparation without claiming an account is connected',()=>{
 const a=app();a.run("state.settingsOpen=true;state.integration='github';render()");
 assert.match(a.html(),/GitHub 연결 설정/);assert.match(a.html(),/연결되지 않음/);
 assert.match(a.html(),/계정 연결이나 외부 자료 조회를 수행하지 않습니다/);
 a.run('close()');assert.doesNotMatch(a.html(),/class="settings-dialog"/);
});
test('project review opens the exact work item; both answers update status and counts',()=>{
 const a=app();a.run("state.project='ax';render()");
 assert.match(a.html(),/data-action="reviews"/);
 const before=a.run('reviewCount()');
 a.run("openTaskReview('R-01')");
 assert.equal(a.run('state.reviews'),false);assert.equal(a.run('state.project'),'ax');assert.equal(a.run('state.drawerTask'),'AX-05');
 a.run("answerReview('R-01','완료')");assert.equal(a.run("state.taskStates.get('AX-05')"),'완료');assert.equal(a.run('reviewCount()'),before-1);
 assert.match(a.html(),/class="tag plan-status completed"/);
 a.run("answerReview('R-01','진행 중')");assert.equal(a.run("state.taskStates.get('AX-05')"),'진행 중');assert.equal(a.run('reviewCount()'),before-1);
 assert.match(a.html(),/class="tag plan-status (active|undated|late)"/);
});
test('no exclusive project phase classification and summary uses prose with optional details',()=>{
 const a=app();for(const theme of ['linear','notion','attio','airtable','clickup']){
  a.run(`state.theme='${theme}';render()`);assert.doesNotMatch(a.html(),/data-action="type"|class="project-type-tabs"/);
 }
 assert.match(a.run('weekly()'),/class="weekly-details"/);assert.match(a.run('weekly()'),/정리했습니다|만들었습니다|확인했습니다/);
});
test('long-running example starts before October and monthly bar signals continuation',()=>{
 const a=app();assert.ok(a.run("projects.some(p=>M.projectRange(p).start<'2026-10-01')"));
 assert.match(a.run('timeline(projects)'),/class="timeline-continuation"/);
 a.run('state.timelineMonth=-2');assert.match(a.run('timeline(projects)'),/2026년 9월/);
});
test('Airtable field and grouping controls render; HTML strings are escaped',()=>{
 const a=app();a.run("state.theme='airtable';state.grouped=true;state.hideFields=true;render()");assert.match(a.html(),/air-grid hide-fields/);assert.match(a.html(),/class="air-group"/);
 assert.equal(a.run("esc('<img onerror=alert(1)>')"),'&lt;img onerror=alert(1)&gt;');
});
test('demo records have valid hierarchy, dates, project types and common categories',()=>{
 const data=JSON.parse(fs.readFileSync(path.join(root,'data.json'),'utf8'));
 const categories=['기획·설계','조사·분석','제작·구현','검증','운영·지원'];
 const ids=new Set();
 for(const p of data.projects){
  assert.equal(p.projectType,undefined);
  assert.equal(p.status,undefined);
  for(const t of p.tasks){
   assert.ok(categories.includes(t.topic));assert.ok(Number.isFinite(Date.parse(t.createdAt)));
   assert.equal(t.status,undefined);assert.ok(t.subtasks.length>0);
   for(const s of t.subtasks){assert.ok(!ids.has(s.id));ids.add(s.id);assert.ok(s.artifact&&s.owner);assert.ok(Date.parse(s.performedAt)>=Date.parse(t.createdAt));}
  }
  for(const f of p.files){assert.ok(p.tasks.some(t=>t.id===f.taskId));assert.ok(categories.includes(f.topic));}
 }
});


test('WBS tasks sort naturally before activity and show owner dates state and plan progress',()=>{
 const a=app();
 a.run(`projects.splice(0,projects.length,{id:'wbs',name:'WBS',desc:'',owner:'',files:[],tasks:[
 {id:'activity',title:'계획 밖',topic:'검증',status:'completed',subtasks:[]},
 {id:'t10',title:'열번째',wbsCode:'1.10',planSource:'wbs',owner:'합성',startDate:'2026-11-18',dueDate:'2026-11-30',subtasks:[]},
 {id:'t2',title:'두번째',wbsCode:'1.2',planSource:'wbs',owner:'합성',startDate:'2026-11-01',dueDate:'2026-11-16',subtasks:[]}]});`);
 const html=a.run('taskPanel(projects[0])');
 assert.ok(html.indexOf('두번째')<html.indexOf('열번째'));assert.ok(html.indexOf('열번째')<html.indexOf('계획 밖'));
 assert.match(html,/1.2/);assert.ok(html.includes('합성 · 11/1~11/16'));assert.match(html,/>확인 필요</);assert.match(html,/>예정</);assert.doesNotMatch(html,/gantt-group-label/);
 assert.ok(a.run('projectInfo(projects[0])').includes('진척 33% · 완료 1/3 · 계획 0%'));
 assert.match(a.run('projectInfo({id:"x",name:"",desc:"",tasks:[],files:[]})'),/진척 0% · 완료 0\/0/);
});
test('expanded monthly WBS rows share dates, natural order and reusable task details',()=>{
 const a=app();a.run(`projects[0].tasks=[
 {...projects[0].tasks[0],id:'ten',planSource:'wbs',wbsCode:'1.10',startDate:'2026-11-10',dueDate:'2026-11-12'},
 {...projects[0].tasks[0],id:'two',planSource:'wbs',wbsCode:'1.2',startDate:'2026-11-01',dueDate:'2026-11-03'},
 {...projects[0].tasks[0],id:'due',planSource:'wbs',dueDate:'2026-11-30',startDate:''},
 {...projects[0].tasks[0],id:'none',planSource:'wbs',dueDate:'',startDate:''},
 {...projects[0].tasks[0],id:'outside',planSource:'wbs',startDate:'2026-12-01',dueDate:'2026-12-03'},
 {...projects[0].tasks[0],id:'activity',planSource:'activity'}];state.project=projects[0].id;`);
 const html=a.run('timeline([projects[0]],false,true)');
 assert.ok(html.indexOf('data-gantt-task="two"')<html.indexOf('data-gantt-task="ten"'));
 assert.match(html,/class="timeline-summary/);assert.doesNotMatch(html,/gantt-group-label/);
 assert.match(html,/left:30%;width:10%/);assert.match(html,/left:0%;width:10%/);
 assert.match(html,/left:96.66666666666667%;width:3.3333333333333286%/);
 assert.match(html,/일정 미정/);assert.match(html,/12\/1 — 12\/3/);
 assert.doesNotMatch(a.run('projectDetail(projects[0])'),/class="work-section"/);
 a.run("state.drawerTask='two'");assert.doesNotMatch(a.run('timeline([projects[0]],false,true)'),/gantt-task-details/);assert.match(a.run('taskDrawer()'),/drawer-day/);
 a.run("state.theme='notion'");assert.match(a.run('projectDetail(projects[0])'),/class="work-section"/);
});

test('heatmap counts unique owner task pairs by KST with fixed levels and record totals',()=>{
 const a=app();a.run(`projects.splice(0,projects.length,{id:'x',tasks:[{id:'one',subtasks:[
 ...Array.from({length:5},()=>({owner:'가',performedAt:'2026-11-16T16:00:00Z'})),
 {owner:'나',performedAt:'2026-11-17'},{owner:'가',performedAt:'2026-11-16T14:00:00Z'},
 {owner:'가',performedAt:'',performedAtPrecision:'unknown'}]},
 {id:'two',subtasks:[{owner:'가',performedAt:'2026-11-17'}]}]});`);
 let html=a.run('heatmap()');assert.match(html,/level-3"[^>]*data-value="2026-11-17"[^>]*태스크 3개 · 기록 7건/);
 assert.match(html,/태스크·일 4/);assert.match(html,/하루에 손댄 태스크 수/);assert.match(html,/3–4/);
 a.run("state.owner='가'");html=a.run('heatmap()');assert.match(html,/level-2"[^>]*data-value="2026-11-17"[^>]*태스크 2개 · 기록 6건/);
 for(const [n,level] of [[0,0],[1,1],[2,2],[3,3],[4,3],[5,4],[8,4]]) {
  a.run(`state.owner='전체';projects[0].tasks=Array.from({length:${n}},(_,i)=>({id:String(i),subtasks:[{owner:'가',performedAt:'2026-11-17'}]}));`);
  assert.match(a.run('heatmap()'),new RegExp('level-'+level+'"[^>]*data-value="2026-11-17"'));
 }
});

test('WBS table columns, planned-only project range, depth, progress fill and all expand',()=>{
 const a=app();a.run(`projects[0].tasks=[{...projects[0].tasks[0],id:'deep',planSource:'wbs',wbsCode:'1.1.1',wbsGroups:['1 상위','1.1 하위'],startDate:'2026-11-02',dueDate:'2026-11-06',status:'completed'},{...projects[0].tasks[0],id:'later',planSource:'wbs',wbsCode:'1.2',startDate:'2026-11-09',dueDate:'2026-11-10',status:'in_progress'}];state.project=projects[0].id;`);
 const html=a.run('timeline([projects[0]],false,true)');
 assert.match(html,/이름 \(WBS\)/);assert.match(html,/진척 \/ 상태/);assert.match(html,/--wbs-depth:2/);assert.match(html,/class="summary-fill" style="width:50%"/);assert.match(html,/class="gantt-bar-label"/);assert.match(html,/11\/2–11\/10/);assert.match(html,/weekend/);assert.doesNotMatch(html,/inline-detail-head|project-properties/);
 a.run("action({dataset:{action:'projects-all'}})");assert.equal(a.run('filtered().every(projectOpen)'),true);
 a.run("action({dataset:{action:'projects-all'}})");assert.equal(a.run('filtered().some(projectOpen)'),false);
});

test('unverified chips, activity deadlines and six-state Gantt legend are distinct from late',()=>{
 const a=app();a.run(`projects[0].tasks=[
 {...projects[0].tasks[0],id:'unknown',planSource:'wbs',status:'in_progress',startDate:'2026-11-01',dueDate:'2026-11-02',subtasks:[]},
 {...projects[0].tasks[0],id:'late',planSource:'wbs',status:'in_progress',startDate:'2026-11-01',dueDate:'2026-11-02'},
 {...projects[0].tasks[0],id:'activity',planSource:'activity',status:'in_progress',dueDate:'2026-11-02',subtasks:[]}];state.project=projects[0].id;render()`);
 const html=a.html();assert.match(html,/class="tag plan-status unverified">확인 2</);assert.match(html,/class="tag plan-status late">지연</);
 assert.match(html,/task-gantt-bar unverified/);assert.match(html,/task-gantt-bar late/);
 assert.match(a.run('taskItem(projects[0].tasks[2],projects[0])'),/확인 필요/);
 const legend=html.match(/<div class="gantt-status-legend"[^>]*>(.*?)<\/div>/)[1];
 for(const label of ['완료','진행 중','지연','확인 필요','예정','일정 미정'])assert.ok(legend.includes('>'+label+'<'));
 const css=fs.readFileSync(path.join(root,'styles.css'),'utf8');assert.match(css,/plan-status.unverified[^}]*dashed/);assert.match(css,/task-gantt-bar.unverified[^}]*repeating-linear-gradient/);
});

 test('task drawer keeps properties, evidence, grouped logs and deduplicated source files',()=>{
 const a=app();a.run("state.drawerTask=projects[0].tasks[0].id;projects[0].tasks[0].completedAt='2026-11-17';projects[0].tasks[0].completionBasis='산출물 승인';");
 const html=a.run('taskDrawer()');assert.match(html,/role="dialog" aria-modal="true" aria-labelledby="task-drawer-title"/);for(const text of ['상태','담당','기간','완료일','산출물 승인','산출물','작업 내역','관련 자료'])assert.ok(html.includes(text));
 assert.equal((html.match(/class="drawer-entry"/g)||[]).length,a.run('projects[0].tasks[0].subtasks.length'));
 assert.equal((html.match(/class="drawer-files"/g)||[]).length,1);a.run("state.theme='notion'");assert.equal(a.run('taskDrawer()'),'');
 });
test('WBS group rows summarize children, preserve root ordering and collapse nested tasks',()=>{
 const a=app();a.run(`projects[0].tasks=[
 {id:'nine',title:'최상위 아홉',wbsCode:'9',planSource:'wbs',subtasks:[]},
 {id:'b',title:'두번째 말단',wbsCode:'2.1.2',wbsGroups:['2 플랫폼 비교평가','2.1 비교평가'],planSource:'wbs',startDate:'2026-11-05',subtasks:[]},
 {id:'a',title:'첫번째 말단',wbsCode:'2.1.1',wbsGroups:['2 플랫폼 비교평가','2.1 비교평가'],planSource:'wbs',status:'completed',startDate:'2026-11-01',dueDate:'2026-11-03',subtasks:[]}
 ];state.project=projects[0].id;`);
 let html=a.run('taskTimeline(projects[0],M.monthRange(AX_DATA.demoAsOf,0))');
 assert.equal((html.match(/data-gantt-group=/g)||[]).length,2);assert.match(html,/완료 1\/2/);assert.match(html,/11\/1 ~ 종료일 미정/);assert.match(html,/wbs-group-summary/);
 assert.ok(html.indexOf('2 플랫폼')<html.indexOf('2.1 비교'));assert.ok(html.indexOf('첫번째 말단')<html.indexOf('두번째 말단'));assert.ok(html.indexOf('두번째 말단')<html.indexOf('최상위 아홉'));
 assert.match(html,/--wbs-depth:2/);assert.match(html,/--wbs-depth:0/);
 a.run(`action({dataset:{action:'wbs-group',group:JSON.stringify([projects[0].id,'2 플랫폼 비교평가'])}})`);
 html=a.run('taskTimeline(projects[0],M.monthRange(AX_DATA.demoAsOf,0))');assert.doesNotMatch(html,/첫번째 말단|두번째 말단|2.1 비교평가/);assert.match(html,/최상위 아홉/);assert.equal((html.match(/data-gantt-group=/g)||[]).length,1);
 a.run(`action({dataset:{action:'wbs-group',group:JSON.stringify([projects[0].id,'2 플랫폼 비교평가'])}})`);
 assert.match(a.run('taskTimeline(projects[0],M.monthRange(AX_DATA.demoAsOf,0))'),/첫번째 말단/);
 a.run("state.drawerTask='a'");assert.match(a.run('taskDrawer()'),/2 플랫폼 비교평가 \/ 2.1 비교평가 \/ 2.1.1/);assert.doesNotMatch(a.run('taskDrawer()'),/계획 출처/);
});
test('activity copy and work dots explain their meaning and daily record count',()=>{
 const a=app();a.run(`projects[0].tasks=[{id:'x',title:'합성',subtasks:[{performedAt:'2026-11-04',owner:'합성'},{performedAt:'2026-11-04',owner:'합성'}]}];state.drawerTask='x'`);
 const html=a.run('taskTimeline(projects[0],M.monthRange(AX_DATA.demoAsOf,0))');
 assert.doesNotMatch(html,/gantt-group-label|activity-bar/);assert.match(html,/<code><\/code>/);assert.match(html,/title="11월 4일 · 기록 2건" aria-label="11월 4일 · 기록 2건"/);
 assert.match(a.run('statusLegend()'),/● 작업 기록\(그날 기록이 있음\)/);assert.doesNotMatch(a.run('taskDrawer()'),/계획 출처|WBS에 없/);
});

test('source and build omit task classification copy',()=>{for(const f of ['src/app.ts','app.js'])assert.doesNotMatch(fs.readFileSync(path.join(root,f),'utf8'),/계획 외|WBS에 없|계획 출처|계획 없음/)});
test('preview opens original folder with file fallback',()=>{
 const a=app();a.run("const f=projects[0].files[0];f.url='https://docs.google.com/document/d/test';f.folderUrl='https://drive.google.com/drive/folders/f';state.modal={project:projects[0].id,file:f.id}");
 let html=a.run('modal()');assert.ok(html.includes('href="https://drive.google.com/drive/folders/f"'));assert.match(html,/Google Drive에서 폴더 열기/);assert.doesNotMatch(html,/원본 열기|Drive에서 이 파일 찾기/);
 a.run('delete projects[0].files[0].folderUrl');html=a.run('modal()');assert.ok(html.includes('href="'+a.run('projects[0].files[0].url')+'"'));
});

test('numberless tasks follow numbered tasks by start or first record with uniform bars',()=>{
 const a=app();a.run(`const base=projects[0].tasks[0];projects[0].tasks=[{...base,id:'later',wbsCode:undefined,wbsGroups:['ignored'],planSource:'wbs',startDate:'2026-11-08',dueDate:'2026-11-09'},{...base,id:'first',wbsCode:undefined,wbsGroups:[],planSource:'activity',startDate:undefined,dueDate:undefined,subtasks:[{performedAt:'2026-11-02'}]},{...base,id:'number',wbsCode:'1.1',wbsGroups:[],planSource:'activity'}]`);
 assert.deepEqual(Array.from(a.run('drawerTasks(projects[0]).map(t=>t.id)')),['number','first','later']);
 const html=a.run('taskTimeline(projects[0],M.monthRange(AX_DATA.demoAsOf,0))');
 assert.ok(html.indexOf('data-gantt-task="number"')<html.indexOf('data-gantt-task="first"'));assert.ok(html.indexOf('data-gantt-task="first"')<html.indexOf('data-gantt-task="later"'));
 assert.doesNotMatch(html,/activity-bar|gantt-group-label|wbs-group-row|--wbs-depth:1/);assert.equal((html.match(/<code><\/code>/g)||[]).length,2);
});
