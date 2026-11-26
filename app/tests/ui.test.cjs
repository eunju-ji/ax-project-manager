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
 for(const theme of ['linear','linear-notion','layout-2','layout-3']){const setup=`state.theme='${theme}';state.project=projects[0].id;render()`;a.run(setup);baseline.run(setup);assert.equal(a.html(),baseline.html());}
 assert.ok(!a.run("projects.flatMap(p=>p.tasks).some(t=>t.planSource==='reference')"));
});
test('merged tasks are absent from every theme, summaries, counts and drawer navigation',()=>{
 const a=app(`AX_DATA.projects[0].tasks.push({...AX_DATA.projects[0].tasks[0],id:'merged',title:'MERGED_HIDDEN',merged_into:AX_DATA.projects[0].tasks[0].id,owner:'MERGED_OWNER'});AX_DATA.projects[0].files.push({...AX_DATA.projects[0].files[0],id:'merged-file',taskId:'merged',name:'MERGED_HIDDEN'});`),baseline=app();
 assert.ok(!a.run("projects.flatMap(p=>p.tasks).some(t=>t.id==='merged')"));assert.ok(!a.run("M.owners(projects).includes('MERGED_OWNER')"));
 for(const unit of ['day','week','month']){const code=`state.summaryUnit='${unit}';render()`;a.run(code);baseline.run(code);assert.equal(a.html(),baseline.html());}
 for(const theme of ['linear-notion','linear','layout-2','layout-3']){const code=`state.theme='${theme}';state.project=projects[0].id;state.drawerTask=projects[0].tasks[0].id;render()`;a.run(code);baseline.run(code);assert.equal(a.html(),baseline.html());assert.doesNotMatch(a.html(),/MERGED_HIDDEN/);}
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
 assert.match(before,/class="today-line"/);assert.match(before,/>1<\/span>/);assert.match(before,/>30<\/span>/);
 a.run('state.week=-2');assert.equal(a.run('timeline(projects)'),before);
 a.run('state.timelineMonth=1');assert.match(a.run('timeline(projects)'),/2026년 12월/);
});
test('weekly visual distribution reconciles to actual execution records',()=>{
 const a=app();assert.match(a.html(),/class="weekly-visual"/);assert.match(a.html(),/class="work-distribution"/);
 assert.match(a.html(),/담당자별 작업/);
 const total=a.run('records().length');assert.equal(a.run('M.categories.reduce((n,c)=>n+records().filter(r=>r.task.topic===c).length,0)'),total);
});
test('episodes order all dates and times newest first',()=>{
 const a=app();const markup=a.run('executionEpisodes(projects[0],projects[0].tasks)');
 const timestamps=[...markup.matchAll(/datetime="([^"]+)"/g)].map(m=>Date.parse(m[1]));
 assert.ok(timestamps.length>1);assert.deepEqual(timestamps,timestamps.slice().sort((a,b)=>b-a));
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
 const a=app();for(const theme of ['linear','linear-notion','layout-2','layout-3']){
  a.run(`state.theme='${theme}';render()`);assert.doesNotMatch(a.html(),/data-action="type"|class="project-type-tabs"/);
 }
 assert.match(a.run('weekly()'),/class="weekly-details"/);assert.match(a.run('weekly()'),/했습니다/);
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
 assert.doesNotMatch(html,/<code>/);assert.ok(html.includes('합성 · 11/1~11/16'));assert.match(html,/>확인 필요</);assert.match(html,/>예정</);assert.doesNotMatch(html,/gantt-group-label/);
 assert.ok(a.run('projectInfo(projects[0])').includes('class="progress-percent">33%</strong>'));
 assert.match(a.run('projectInfo({id:"x",name:"",desc:"",tasks:[],files:[]})'),/class="progress-detail">0\/0 완료/);
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
 assert.match(html,/class="deadline-marker"/);
 assert.match(html,/일정 미정/);assert.match(html,/12\/1 — 12\/3/);
 assert.doesNotMatch(a.run('projectDetail(projects[0])'),/class="work-section"/);
 a.run("state.drawerTask='two'");assert.doesNotMatch(a.run('timeline([projects[0]],false,true)'),/gantt-task-details/);assert.match(a.run('taskDrawer()'),/drawer-day/);
 a.run("state.theme='linear-notion'");assert.match(a.run('projectDetail(projects[0])'),/gantt-resources/);
});

test('heatmap counts unique owner task pairs by KST with fixed levels and record totals',()=>{
 const a=app();a.run(`projects.splice(0,projects.length,{id:'x',tasks:[{id:'one',subtasks:[
 ...Array.from({length:5},()=>({owner:'가',performedAt:'2026-11-16T16:00:00Z'})),
 {owner:'나',performedAt:'2026-11-17'},{owner:'가',performedAt:'2026-11-16T14:00:00Z'},
 {owner:'가',performedAt:'',performedAtPrecision:'unknown'}]},
 {id:'two',subtasks:[{owner:'가',performedAt:'2026-11-17'}]}]});`);
 let html=a.run('heatmap()');assert.match(html,/level-3"[^>]*data-value="2026-11-17"[^>]*태스크 3개 · 기록 7건/);
 assert.match(html,/최근 10개월/);assert.match(html,/적음/);assert.match(html,/많음/);assert.doesNotMatch(html,/태스크·일|하루에 손댄/);
 a.run("state.owner='가'");html=a.run('heatmap()');assert.match(html,/level-2"[^>]*data-value="2026-11-17"[^>]*태스크 2개 · 기록 6건/);
 for(const [n,level] of [[0,0],[1,1],[2,2],[3,3],[4,3],[5,4],[8,4]]) {
  a.run(`state.owner='전체';projects[0].tasks=Array.from({length:${n}},(_,i)=>({id:String(i),subtasks:[{owner:'가',performedAt:'2026-11-17'}]}));`);
  assert.match(a.run('heatmap()'),new RegExp('level-'+level+'"[^>]*data-value="2026-11-17"'));
 }
});

test('WBS table columns, planned-only project range, depth, progress fill and all expand',()=>{
 const a=app();a.run(`projects[0].tasks=[{...projects[0].tasks[0],id:'deep',planSource:'wbs',wbsCode:'1.1.1',wbsGroups:['1 상위','1.1 하위'],startDate:'2026-11-02',dueDate:'2026-11-06',status:'completed'},{...projects[0].tasks[0],id:'later',planSource:'wbs',wbsCode:'1.2',startDate:'2026-11-09',dueDate:'2026-11-10',status:'in_progress'}];state.project=projects[0].id;`);
 const html=a.run('timeline([projects[0]],false,true)');
 assert.match(html,/>이름</);assert.match(html,/진척 \/ 상태/);assert.match(html,/--wbs-depth:1/);assert.match(html,/class="summary-fill" style="width:50%"/);assert.doesNotMatch(html,/class="gantt-bar-label"/);assert.match(html,/11\/2–11\/10/);assert.match(html,/weekend/);assert.doesNotMatch(html,/inline-detail-head|project-properties/);
 a.run("action({dataset:{action:'projects-all'}})");assert.equal(a.run('filtered().every(projectOpen)'),true);
 a.run("action({dataset:{action:'projects-all'}})");assert.equal(a.run('filtered().some(projectOpen)'),false);
});

test('unverified chips, activity deadlines and six-state Gantt legend are distinct from late',()=>{
 const a=app();a.run(`projects[0].tasks=[
 {...projects[0].tasks[0],id:'unknown',planSource:'wbs',status:'in_progress',startDate:'2026-11-01',dueDate:'2026-11-02',subtasks:[]},
 {...projects[0].tasks[0],id:'late',planSource:'wbs',status:'in_progress',startDate:'2026-11-01',dueDate:'2026-11-02'},
 {...projects[0].tasks[0],id:'activity',planSource:'activity',status:'in_progress',dueDate:'2026-11-02',subtasks:[]}];state.project=projects[0].id;render()`);
 const html=a.html();assert.match(html,/class="tag plan-status unverified">확인 필요 2</);assert.match(html,/class="task-status plan-status late"><i class="status-dot"[^>]*><\/i>지연</);
 assert.match(html,/task-gantt-bar unverified/);assert.match(html,/task-gantt-bar late/);
 assert.match(a.run('taskItem(projects[0].tasks[2],projects[0])'),/확인 필요/);
 assert.doesNotMatch(html,/class="gantt-status-legend"/);
 const css=fs.readFileSync(path.join(root,'styles.css'),'utf8');assert.match(css,/plan-status.unverified[^}]*border:0/);assert.match(css,/task-gantt-bar.unverified[^}]*repeating-linear-gradient/);
});

 test('task drawer keeps properties, evidence, grouped logs and deduplicated source files',()=>{
 const a=app();a.run("state.drawerTask=projects[0].tasks[0].id;projects[0].tasks[0].completedAt='2026-11-17';projects[0].tasks[0].completionBasis='산출물 승인';");
 const html=a.run('taskDrawer()');assert.match(html,/role="dialog" aria-modal="true" aria-labelledby="task-drawer-title"/);for(const text of ['상태','담당','기간','완료일','산출물 승인','산출물','작업 내역','관련 자료'])assert.ok(html.includes(text));
 assert.equal((html.match(/class="drawer-entry"/g)||[]).length,a.run('projects[0].tasks[0].subtasks.length'));
 assert.equal((html.match(/class="drawer-files"/g)||[]).length,1);a.run("state.theme='linear-notion'");assert.match(a.run('taskDrawer()'),/task-drawer/);
 });
test('plan groups stay in the drawer while list tasks keep natural order',()=>{
 const a=app();a.run(`const base=projects[0].tasks[0];projects[0].tasks=[{...base,id:'nine',title:'최상위 아홉',wbsCode:'9',stage:undefined,wbsGroups:[]},{...base,id:'b',title:'두번째 말단',wbsCode:'2.1.2',stage:undefined,wbsGroups:['2 플랫폼 비교평가','2.1 비교평가']},{...base,id:'a',title:'첫번째 말단',wbsCode:'2.1.1',stage:undefined,wbsGroups:['2 플랫폼 비교평가','2.1 비교평가']}];`);
 const html=a.run('taskTimeline(projects[0],M.monthRange(AX_DATA.demoAsOf))');assert.doesNotMatch(html,/wbs-group-row|wbs-group-summary|data-gantt-group/);assert.ok(html.indexOf('첫번째 말단')<html.indexOf('두번째 말단'));assert.ok(html.indexOf('두번째 말단')<html.indexOf('최상위 아홉'));a.run(`state.drawerTask='a'`);assert.match(a.run('taskDrawer()'),/계획 문서 묶음/);assert.match(a.run('taskDrawer()'),/플랫폼 비교평가 \/ 비교평가/);
});
test('activity copy and work dots explain their meaning and daily record count',()=>{
 const a=app();a.run(`projects[0].tasks=[{id:'x',title:'합성',subtasks:[{performedAt:'2026-11-04',owner:'합성'},{performedAt:'2026-11-04',owner:'합성'}]}];state.drawerTask='x'`);
 const html=a.run('taskTimeline(projects[0],M.monthRange(AX_DATA.demoAsOf,0))');
 assert.doesNotMatch(html,/gantt-group-label/);assert.doesNotMatch(html,/<code>/);assert.match(html,/title="11월 4일 · 작업 2건" aria-label="11월 4일 · 작업 2건"/);
 assert.match(a.run('statusLegend()'),/● 작업한 날/);assert.doesNotMatch(a.run('taskDrawer()'),/계획 출처|WBS에 없/);
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
 assert.doesNotMatch(html,/gantt-group-label|wbs-group-row/);assert.equal((html.match(/--wbs-depth:1/g)||[]).length,3);assert.equal((html.match(/<code>/g)||[]).length,0);
});
for(const kind of ['commit','pull_request','issue','ai_chat'])test('index-only source modal '+kind,()=>{
 const a=app();a.run(`const f=projects[0].files[0];Object.assign(f,{kind:'${kind}',url:'https://github.com/o/r',folderId:'ignored',folderPath:['ignored']});state.modal={project:projects[0].id,file:f.id}`);let html=a.run('modal()');assert.match(html,/https:\/\/github.com\/o\/r/);assert.doesNotMatch(html,/folder-browser|<img|Google Drive/);a.run('projects[0].files[0].url=undefined');html=a.run('modal()');assert.doesNotMatch(html,/<a |folder-browser|<img/);
});

test('project sections separate core and always open operations; pins sort and persist per mode',()=>{
 const a=app(`AX_DATA.projects[1].kind='ops'`);let html=a.run('projectArea()');assert.match(html,/핵심 프로젝트/);assert.match(html,/AX팀 운영/);assert.doesNotMatch(html,/id="ops-projects" hidden|ops-toggle/);assert.ok(html.includes('data-action="project" data-id="'+a.run('projects[1].id')+'"'));

 a.run(`globalThis.saved={};localStorage.setItem=(k,v)=>saved[k]=v;togglePin(projects.at(-1).id);localStorage.getItem=k=>saved[k];`);assert.equal(a.run('readPins().has(projects.at(-1).id)'),true);assert.equal(a.run('pinKey'),'ax-project-pins:example');html=a.run('projectArea()');assert.ok(html.indexOf('data-action="project-pin" data-id="'+a.run('projects.at(-1).id')+'"')<html.indexOf('data-action="project-pin" data-id="'+a.run('projects[0].id')+'"'));assert.match(html,/aria-pressed="true"/);
});
test('stages summarize status, group in order, hide numbers, and expose drawer properties',()=>{
 const a=app();a.run(`const base=projects[0].tasks[0];projects[0].tasks=[{...base,id:'dev',title:'5.1 구현',wbsCode:'5.1',wbsGroups:['5 구현'],stage:'개발·테스트',status:'in_progress',startDate:'2026-11-01'},{...base,id:'research',stage:'리서치',status:'completed'},{...base,id:'plan',stage:'기획',status:'in_progress',startDate:'2026-12-01'},{...base,id:'none',stage:null}];`);
 assert.equal(a.run('stageStates(projects[0]).map(s=>s.status).join()'),'완료,예정,진행');let html=a.run('taskTimeline(projects[0],M.monthRange(AX_DATA.demoAsOf))');assert.ok(html.indexOf('리서치')<html.indexOf('개발·테스트'));assert.ok(html.indexOf('data-gantt-task="none"')>html.indexOf('data-gantt-task="dev"'));assert.doesNotMatch(html,/<code>|>5\.1 구현</);
 a.run(`state.drawerTask='dev'`);html=a.run('taskDrawer()');assert.match(html,/<dt>단계<\/dt><dd><span class="stage-chip"[^>]*>개발·테스트/);assert.match(html,/<dt>WBS 번호<\/dt><dd>5.1/);
});
test('next step prefers earliest due, then earliest start, then undated',()=>{
 const a=app();a.run(`const base=projects[0].tasks[0];projects[0].tasks=[{...base,id:'undated',status:'in_progress',startDate:undefined,dueDate:undefined},{...base,id:'future2',status:'in_progress',startDate:'2026-12-02',dueDate:'2026-12-03'},{...base,id:'future1',status:'in_progress',startDate:'2026-12-01',dueDate:undefined},{...base,id:'active2',status:'in_progress',startDate:'2026-11-01',dueDate:'2026-11-22'},{...base,id:'active1',status:'in_progress',startDate:'2026-11-01',dueDate:'2026-11-19'}]`);
 assert.equal(a.run('nextTask(projects[0]).id'),'active1');a.run(`projects[0].tasks=projects[0].tasks.filter(t=>!t.id.startsWith('active'))`);assert.equal(a.run('nextTask(projects[0]).id'),'future2');a.run(`projects[0].tasks=projects[0].tasks.filter(t=>!t.id.startsWith('future'))`);assert.equal(a.run('nextTask(projects[0]).id'),'undated');
});

test('period table follows work dates, owner and pagination',()=>{
 const a=app();a.run(`const p=projects[0],base=p.tasks[0];p.tasks=Array.from({length:14},(_,i)=>({...base,id:'period-'+i,title:'기간 업무 '+i,owner:'합성 담당',startDate:'2026-11-16',dueDate:'2026-11-18',subtasks:[{owner:'합성 담당',performedAt:AX_DATA.demoAsOf}]}));`);
 assert.equal(a.run("periodTasks().filter(r=>r.project.id===projects[0].id).length"),14);
 assert.equal((a.run('summaryTasks()').match(/class="summary-task-row"/g)||[]).length,10);
 a.run('state.summaryLimit=20');assert.match(a.run('summaryTasks()'),/기간 업무 13/);
 a.run("state.summaryUnit='day'");assert.match(a.run('summaryTasks()'),/기간 업무 13/);
 a.run('state.week=-10');assert.doesNotMatch(a.run('summaryTasks()'),/기간 업무 13/);
 a.run("state.week=0;state.weekOwner='다른 담당'");assert.doesNotMatch(a.run('summaryTasks()'),/기간 업무 13/);
});
test('folder pins have one folder per project in every theme and toggle pressed state',()=>{
 const a=app();a.run('togglePin(projects[0].id)');assert.match(a.run('pinButton(projects[0])'),/aria-pressed="true"/);assert.doesNotMatch(a.run('pinButton(projects[0])'),/☆|★/);
 for(const theme of ['linear-notion','linear','layout-2','layout-3']){a.run(`state.theme='${theme}'`);assert.equal((a.run('projectArea()').match(/data-action="project-pin"/g)||[]).length,a.run('filtered().length'));}
 a.run('togglePin(projects[0].id)');assert.match(a.run('pinButton(projects[0])'),/aria-pressed="false"/);
});
test('schedule filters hide unmatched projects and rows and drawer tasks have no chevrons',()=>{
 const a=app();a.run("state.projectStatus='completed';state.summaryStatus='completed'");assert.ok(a.run("filtered().every(p=>p.tasks.some(t=>matchesStatus(t,'completed')))"));
 assert.doesNotMatch(a.run('taskTimeline(projects[0],M.monthRange(AX_DATA.demoAsOf,0))'),/plan-status (active|late|unverified|upcoming)/);
 assert.doesNotMatch(a.run('summaryTasks()'),/plan-status (active|late|unverified|upcoming)/);
 a.run("state.projectStatus='all'");assert.doesNotMatch(a.run('taskTimeline(projects[0],M.monthRange(AX_DATA.demoAsOf,0))').split('data-gantt-task=')[1]?.split('</button>')[0]||'',/expand-chevron/);
});
test('ADR-024 actual range ends at completion rather than subsequent work',()=>{
 const a=app();a.run(`const t=projects[0].tasks[0];Object.assign(t,{status:'completed',startDate:'2026-11-01',dueDate:'2026-11-10',completedAt:'2026-11-12',subtasks:[{performedAt:'2026-11-03'},{performedAt:'2026-11-15'}]});`);
 assert.equal(a.run('actualLabel(projects[0].tasks[0])'),'11/3 ~ 11/12');assert.equal(a.run('adherence(projects[0].tasks[0])'),'기한 후 2일');
});

test('all schedule chip states are filterable and status counts partition each filter total',()=>{
 const a=app();
 a.run(`const base=projects[0].tasks[0];globalThis.filterFixture=[
 {...base,id:'undated',status:'in_progress',startDate:undefined,dueDate:undefined,subtasks:[]},
 {...base,id:'active',status:'in_progress',startDate:'2026-11-17',dueDate:'2026-11-20',subtasks:[]},
 {...base,id:'late',status:'in_progress',startDate:'2026-11-01',dueDate:'2026-11-10',subtasks:[{performedAt:'2026-11-09'}]},
 {...base,id:'unverified',status:'in_progress',startDate:'2026-11-01',dueDate:'2026-11-10',subtasks:[]},
 {...base,id:'upcoming',status:'in_progress',startDate:'2026-11-20',dueDate:'2026-11-25',subtasks:[]},
 {...base,id:'completed',status:'completed',startDate:undefined,dueDate:undefined,subtasks:[]}
 ];`);
 for(const actionName of ['summary-status','project-status']){
  for(const fixture of ['filterFixture','periodTasks().map(r=>r.task)','projectFilterTasks()']){
   const html=a.run(`statusFilters(${fixture},'all','${actionName}')`);
   const counts=[...html.matchAll(/data-value="([^"]+)"[^>]*>[^<]*<span>(\d+)<\/span>/g)];
   assert.equal(counts.length,7);assert.equal(counts.filter(m=>m[1]!=='all').reduce((sum,m)=>sum+Number(m[2]),0),Number(counts.find(m=>m[1]==='all')[2]));
   assert.match(html,/data-value="undated"[^>]*>일정 미정/);
  }
 }
 a.run("state.summaryStatus='undated';state.projectStatus='undated'");
 assert.doesNotMatch(a.run('summaryTasks()'),/plan-status (active|late|unverified|upcoming|completed)/);
 assert.ok(a.run("filtered().every(p=>p.tasks.some(t=>matchesStatus(t,'undated')))"));
 assert.match(a.run("statusFilters([], 'undated', 'summary-status')"),/data-value="undated" aria-pressed="true">일정 미정 <span>0/);
});

test('feedback display uses stage names, uniform path, ten months, markers and accessible operations',()=>{
 const a=app();a.run(`const b=projects[0].tasks[0];projects[0].tasks=[{...b,id:'deadline',stage:'기획',startDate:undefined,dueDate:'2026-11-10'},{...b,id:'bad',startDate:'2026-11-20',dueDate:'2026-11-10'},{...b,id:'worked',startDate:undefined,dueDate:undefined}];state.drawerTask='deadline'`);
 assert.match(a.run('projectSignals(projects[0])'),/aria-label="기획">기획<\/span>/);
 assert.match(a.run('taskDrawer()'),/<small>AX 프로젝트 관리장 \/ 기획<\/small>/);
 const html=a.run('taskTimeline(projects[0],M.monthRange(AX_DATA.demoAsOf))');assert.match(html,/deadline-marker/);assert.match(html,/일정 확인 필요/);assert.match(html,/activity-bar/);assert.doesNotMatch(html,/gantt-bar-label/);
 assert.match(a.run('heatmap()'),/최근 10개월/);assert.doesNotMatch(a.run('timeline(projects,false,true)'),/gantt-status-legend|계획 일정과 작업 기록/);
 a.run(`projects[0].kind='ops'`);assert.doesNotMatch(a.run('projectArea()'),/ops-toggle|id="ops-projects" hidden/);
});

test('third feedback uses uniform stage markup, persistent summary toggle and always open ops',()=>{
 const a=app();a.run(`projects[0].kind='ops';projects[0].tasks[0].stage='기획'`);let html=a.run('projectArea()');assert.doesNotMatch(html,/ops-toggle|id="ops-projects" hidden|project-next/);assert.match(a.run('projectSignals(projects[0])'),/title="기획" aria-label="기획">기획/);assert.doesNotMatch(a.run('projectSignals(projects[0])'),/data-status/);assert.match(a.run('pinButton(projects[0])'),/title="고정"/);a.run('togglePin(projects[0].id)');assert.match(a.run('pinButton(projects[0])'),/title="고정됨"/);
 assert.match(a.run('weekly()'),/class="summary-task-count"[^>]*aria-expanded="false"[^>]*aria-controls="summary-tasks-panel"/);assert.match(a.run('summaryTasks()'),/id="summary-tasks-panel" hidden/);a.run(`action({dataset:{action:'summary-toggle'}});state.week=-1;state.weekOwner='김지현'`);assert.equal(a.run('state.summaryOpen'),true);assert.doesNotMatch(a.run('summaryTasks()'),/id="summary-tasks-panel" hidden/);a.run(`action({dataset:{action:'summary-toggle'}})`);assert.equal(a.run('state.summaryOpen'),false);
});

test('project tags render once in each theme and progress has a numeric hierarchy',()=>{const a=app();a.run(`projects[0].tasks[0].stage='기획'`);for(const theme of ['linear-notion','linear','layout-2','layout-3']){a.run(`state.theme='${theme}'`);const html=a.run('projectArea()');assert.equal((html.match(/class="stage-chip"/g)||[]).length,1);assert.doesNotMatch(html,/계획보다 늦음|class="results-count"/);}const html=a.run('progressMetric({percent:50,done:6,total:12})');assert.match(html,/class="progress-percent">50%/);assert.match(html,/class="progress-detail">6\/12 완료/);assert.doesNotMatch(html,/class="tag|진척 50/);});

test('core and operations reuse identical flat task rows and retain plan groups only in the drawer',()=>{const a=app();a.run(`const base=projects[0].tasks[0];projects[0].tasks=[{...base,id:'flat-a',wbsCode:'1.1',stage:undefined,wbsGroups:['1 원래 계획','1.1 세부 묶음']},{...base,id:'flat-b',wbsCode:'1.2',stage:undefined}];`);let html=a.run('taskTimeline(projects[0],M.monthRange(AX_DATA.demoAsOf))');a.run(`projects[0].kind='ops'`);assert.equal(html,a.run('taskTimeline(projects[0],M.monthRange(AX_DATA.demoAsOf))'));assert.doesNotMatch(html,/wbs-group-row|wbs-group-summary|data-gantt-group|완료 \d+\//);assert.equal((html.match(/class="timeline-row task-gantt-row/g)||[]).length,2);a.run(`projects[0].tasks[0].stage='기획';state.drawerTask='flat-a'`);html=a.run('taskTimeline(projects[0],M.monthRange(AX_DATA.demoAsOf))');assert.match(html,/stage-group-row/);assert.doesNotMatch(html,/wbs-group-row|data-gantt-group/);assert.match(a.run('taskDrawer()'),/계획 문서 묶음/);assert.match(a.run('taskDrawer()'),/원래 계획 \/ 세부 묶음/);assert.match(html,/status-dot/);});


test('timeline project avatars show five people, name tooltips and only the remaining count',()=>{
 const a=app();a.run(`const names=['Jason Serngwoon Choi','Heechang Lee','Eunju Ji','김지현','박성진','이수민','A & B'];projects[0].owner=names[0];projects[0].tasks=names.map((owner,i)=>({...projects[0].tasks[0],id:'avatar-'+i,owner,subtasks:[]}));`);
 const html=a.run('wbsTimeline([projects[0]])');
 assert.equal((html.match(/class="avatar avatar-/g)||[]).length,5);assert.match(html,/<small>\+2<\/small>/);
 assert.equal((html.match(/class="avatar avatar-\d+"[^>]*title="[^"]+"/g)||[]).length,5);assert.match(html,/title="Jason Serngwoon Choi"/);
 a.run('projects[0].tasks=projects[0].tasks.slice(0,5)');assert.doesNotMatch(a.run('projectAvatars(projects[0])'),/<small>/);
 assert.match(a.run(`avatar('A & B')`),/title="A &amp; B"/);
});


test('summary heading has no count and places filters in the expanded heading row',()=>{
 const a=app();let html=a.run('summaryTasks()');assert.doesNotMatch(html,/<small>|class="status-filters"/);
 a.run('state.summaryOpen=true');html=a.run('summaryTasks()');assert.doesNotMatch(html,/<small>/);assert.ok(html.indexOf('class="status-filters"')<html.indexOf('id="summary-tasks-panel"'));assert.match(html,/태스크 상세/);
});
test('related resource cards expose their complete title in a tooltip',()=>{
 const a=app();a.run(`projects[0].files=[{...projects[0].files[0],name:'긴 & 자료 제목을 카드 안에 표시합니다'}]`);
 assert.match(a.run('ganttSources(projects[0])'),/<strong title="긴 &amp; 자료 제목을 카드 안에 표시합니다">/);
});
