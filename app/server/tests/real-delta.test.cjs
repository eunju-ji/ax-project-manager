const test = require('node:test');
const a = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { applyDelta } = require('../real/apply-delta.cjs');
const { createServer } = require('../api/server.cjs');
const { merge } = require('../real/apply-delta.cjs');

function mergeCase() {
 const data={persons:[{person_id:'P'}],projects:[{project_id:'PR',name:'Old'},{project_id:'OTHER'}],tasks:['A','B','C'].map(task_id=>({task_id,project_id:'PR',status:'in_progress'})),worklogs:[{worklog_id:'W',task_id:'A',performer_id:'unknown',summary:'synthetic',performed_at_precision:'unknown'}]};
 return {data,delta:{run_id:'MERGE',collected_at:'2026-11-23T00:00:00Z',task_updates:[{task_id:'A',merged_into:'B'}],worklog_updates:[{worklog_id:'W',task_id:'B'}]}};
}

function removalCase() {
 const {data}=mergeCase();data.tasks[0].plan_source='reference';
 data.sources=[{source_key:'S'}];data.links=[['LW','worklog','W'],['LT','task','A'],['KEEP','task','B']].map(([link_id,target_type,target_id])=>({link_id,target_type,target_id,evidence_type:'source',evidence_key:'S',status:'confirmed'}));
 return {data,delta:{run_id:'REMOVE',collected_at:'2026-11-23T00:00:00Z',worklog_removals:['W'],task_removals:['A']}};
}
test('removals delete targets and links, preserve sources and full history, replay once',()=>{
 const {data,delta}=removalCase(),before=structuredClone(data),r=merge(data,{},delta);a.equal(r.ok,true);a.equal(r.removed,2);a.equal(r.dataset.worklogs.length,0);a.deepEqual(r.dataset.tasks.map(t=>t.task_id),['B','C']);a.deepEqual(r.dataset.links.map(l=>l.link_id),['KEEP']);a.deepEqual(r.dataset.sources,data.sources);a.deepEqual(data,before);
 for(const [type,id] of [['worklogs','W'],['tasks','A']]){const h=r.dataset.history.find(h=>h.entity_id===id);a.equal(h.change_id,'DELTA-REMOVE-'+id);a.deepEqual(h.before,data[type][0]);a.equal(h.after,null);a.equal(h.reason,'remove non-work record');a.equal(h.actor_id,'system');}
 const replay=merge(r.dataset,r.state,delta);a.equal(replay.ok,true);a.equal(replay.ignored,2);a.equal(replay.removed,0);a.equal(replay.dataset.history.length,2);
});
test('task removal accepts reassignment and retains worklog links; legacy reference permits unrelated update',()=>{
 const {data,delta}=removalCase();delete delta.worklog_removals;delta.worklog_updates=[{worklog_id:'W',task_id:'B'}];const r=merge(data,{},delta);a.equal(r.ok,true);a.equal(r.dataset.worklogs[0].task_id,'B');a.deepEqual(r.dataset.links.map(l=>l.link_id),['LW','KEEP']);
 a.equal(merge(data,{}, {run_id:'OLD',collected_at:delta.collected_at,task_updates:[{task_id:'A',title:'updated'}]}).ok,true);
});
for(const kind of ['remaining worklog','new worklog','merge target','human task','human worklog','human unchanged history','updated removal','new removal'])test('removal rejects '+kind+' atomically',()=>{
 const {data,delta}=removalCase();
 if(kind==='remaining worklog')delete delta.worklog_removals;
 if(kind==='new worklog')delta.worklogs=[{...data.worklogs[0],worklog_id:'NEW'}];
 if(kind==='merge target')data.tasks[1].merged_into='A';
 if(kind.startsWith('human')){const type=kind==='human worklog'?'worklogs':'tasks',id=type==='tasks'?'A':'W';data.history=[{entity_type:type,entity_id:id,actor_id:'P',before:{title:'old'},after:{title:kind==='human unchanged history'?'old':'new'}}];}
 if(kind==='updated removal')delta.task_updates=[{task_id:'A',title:'new'}];
 if(kind==='new removal'){delta.tasks=[{task_id:'NEW',project_id:'PR',status:'in_progress'}];delta.task_removals=['NEW'];}
 const before=structuredClone(data),r=merge(data,{},delta);a.equal(r.ok,false);a.equal(r.removed,0);a.deepEqual(data,before);
});
for(const field of ['worklog_removals','task_removals'])for(const value of ['W',[1],[''],[null],['missing'],field==='task_removals'?['A','A']:['W','W']])test(field+' rejects malformed, missing or duplicate '+JSON.stringify(value),()=>{
 const {data,delta}=removalCase();delta[field]=value;const before=structuredClone(data);a.equal(merge(data,{},delta).ok,false);a.deepEqual(data,before);
});
test('removal dry-run preserves bytes; API reload drops removed task',async t=>{
 const f=fixture(t);a.equal(f.apply().ok,true);
 const {server}=createServer({dir:f.dir,seedMode:'small',realDatasetFile:f.file});f.setServer(server);await new Promise(r=>server.listen(0,'127.0.0.1',r));
 const get=async()=>await(await fetch(`http://127.0.0.1:${server.address().port}/api/view?data=real`)).json();a.equal((await get()).projects[0].tasks.length,1);
 const d={run_id:'REMOVE',collected_at:f.delta.collected_at,worklog_removals:['W'],task_removals:['T']},before=f.read();a.equal(f.apply(d,{dryRun:true}).ok,true);a.deepEqual(f.read(),before);a.equal(f.apply(d).removed,2);a.equal(f.read().sources.length,1);a.equal((await get()).projects.flatMap(p=>p.tasks).length,0);
});
test('task merge and worklog move validate final state, preserve history and allow clearing',()=>{
 const {data,delta}=mergeCase(),r=merge(data,{},delta);a.equal(r.ok,true);a.equal(r.updated,2);
 a.equal(r.dataset.tasks[0].merged_into,'B');a.equal(r.dataset.worklogs[0].task_id,'B');a.equal(r.dataset.history[0].after.merged_into,'B');a.equal(data.tasks[0].merged_into,undefined);
 a.equal(merge(r.dataset,r.state,{run_id:'CLEAR',collected_at:delta.collected_at,task_updates:[{task_id:'A',merged_into:null}]}).ok,true);
});
for(const kind of ['missing','self','chain','cycle','cross-project','invalid','new log','moved log','human'])test('task merge rejects '+kind,()=>{
 const {data,delta}=mergeCase();
 if(kind==='missing')delta.task_updates[0].merged_into='absent';
 if(kind==='self')delta.task_updates[0].merged_into='A';
 if(kind==='chain')delta.task_updates.push({task_id:'B',merged_into:'C'});
 if(kind==='cycle')delta.task_updates.push({task_id:'B',merged_into:'A'});
 if(kind==='cross-project')delta.task_updates.push({task_id:'B',project_id:'OTHER'});
 if(kind==='invalid')delta.task_updates[0].merged_into=42;
 if(kind==='new log')delta.worklogs=[{...data.worklogs[0],worklog_id:'NEW'}];
 if(kind==='moved log'){data.worklogs[0].task_id='C';delta.worklog_updates[0].task_id='A';}
 if(kind==='human')data.history=[{entity_type:'tasks',entity_id:'A',actor_id:'P',before:{merged_into:'C'},after:{merged_into:null}}];
 const before=structuredClone(data);a.equal(merge(data,{},delta).ok,false);a.deepEqual(data,before);
});
test('merge may retain historical logs and can clear target merge in same delta',()=>{
 const {data,delta}=mergeCase();data.tasks[1].merged_into='C';delta.task_updates.push({task_id:'B',merged_into:null});delete delta.worklog_updates;
 a.equal(merge(data,{},delta).ok,true);
});
test('project updates record full history, protect human fields and replay counts',()=>{
 const {data,delta}=mergeCase();delta.project_updates=[{project_id:'PR',name:'😀'.repeat(120),purpose:'가'.repeat(200),display_owner:'Owner',owner_id:'P',deputy_id:'P'}];
 const r=merge(data,{},delta);a.equal(r.ok,true);a.equal(r.updated,3);const h=r.dataset.history.find(h=>h.entity_type==='projects');a.equal(h.change_id,'DELTA-MERGE-PR');a.equal(h.before.name,'Old');a.equal(h.after.owner_id,'P');a.equal(merge(r.dataset,r.state,delta).ignored,3);
 a.equal(merge(r.dataset,r.state,{...delta,run_id:'UNCHANGED'}).ignored,3);
 data.history=[{entity_type:'projects',entity_id:'PR',actor_id:'P',before:{name:'Earlier'},after:{name:'Old'}}];a.equal(merge(data,{},delta).ok,false);
 delta.project_updates=[{project_id:'PR',purpose:'Allowed'}];a.equal(merge(data,{},delta).ok,true);
});
for(const update of [{project_id:'missing',name:'x'},{project_id:'PR',name:'x'.repeat(121)},{project_id:'PR',purpose:'x'.repeat(201)},{project_id:'PR',name:null},{project_id:'PR',owner_id:4},{project_id:'PR',body:'raw'},{project_id:'PR',purpose:'token=1234567890abc'}])test('invalid project update '+JSON.stringify(update).slice(0,60),()=>{
 const {data,delta}=mergeCase();delta.project_updates=[update];a.equal(merge(data,{},delta).ok,false);
});
test('duplicate project updates are rejected',()=>{
 const {data,delta}=mergeCase();delta.project_updates=[{project_id:'PR',name:'A'},{project_id:'PR',purpose:'B'}];a.equal(merge(data,{},delta).ok,false);
});
test('unchanged historical worklog submissions remain ignored on merged tasks',()=>{
 const {data,delta}=mergeCase();data.tasks[0].merged_into='B';delta.worklogs=[{...data.worklogs[0]}];delta.worklog_updates[0].task_id='A';
 const r=merge(data,{},delta);a.equal(r.ok,true);a.equal(r.ignored,3);
});
test('merged tasks and updated project fields survive SQLite reload into API projection',async t=>{
 const f=fixture(t);a.equal(f.apply().ok,true);
 const delta={run_id:'API-MERGE',collected_at:f.delta.collected_at,tasks:[{task_id:'T2',project_id:'PR',title:'합친 업무',status:'in_progress'}],task_updates:[{task_id:'T',merged_into:'T2'}],worklog_updates:[{worklog_id:'W',task_id:'T2'}],project_updates:[{project_id:'PR',name:'새 프로젝트',purpose:'새 목적',display_owner:'새 담당'}]};
 a.equal(f.apply(delta).ok,true);const {server}=createServer({dir:f.dir,seedMode:'small',realDatasetFile:f.file});f.setServer(server);await new Promise(r=>server.listen(0,'127.0.0.1',r));
 const v=await (await fetch(`http://127.0.0.1:${server.address().port}/api/view?data=real`)).json();
 a.equal(v.projects[0].name,'새 프로젝트');a.equal(v.projects[0].desc,'새 목적');a.equal(v.projects[0].owner,'새 담당');a.deepEqual(v.projects[0].tasks.map(t=>t.id),['T2']);a.equal(v.projects[0].tasks[0].subtasks[0].id,'W');
});
function fixture(t) {
 const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ax-delta-'));
 let server;
 t.after(async () => { if(server) await new Promise(r=>server.close(r)); fs.rmSync(dir, { recursive: true, force: true }); });
 const file = path.join(dir, 'dataset.json');
 const data = {persons:[{person_id:'P',display_name:'합성'}],projects:[{project_id:'PR',name:'합성'}],tasks:[{task_id:'T',project_id:'PR',title:'초기',status:'in_progress'}],history:[],demoNotice:'마지막 수집 2026-11-19'};
 fs.writeFileSync(file, JSON.stringify(data));
 const delta = {run_id:'R1',collected_at:'2026-11-20T16:00:00Z',checkpoints:{drive:'2026-11-20T16:00:00Z'},worklogs:[{worklog_id:'W',task_id:'T',performer_id:'unknown',summary:'합성 요약',performed_at:'2026-11-20T00:00:00Z',performed_at_precision:'exact'}],sources:[{source_key:'s',title:'합성 자료',kind:'document',folder_path:[]}],links:[{link_id:'L',target_type:'worklog',target_id:'W',evidence_type:'source',evidence_key:'s'}]};
 delta.links[0].status='confirmed';
 return {dir,file,data,delta,setServer:s=>server=s,read:()=>JSON.parse(fs.readFileSync(file,'utf8')),apply:(d=delta,opts={})=>applyDelta(d,{dataset:file,...opts})};
}
test('reference plan source is rejected on new tasks and task updates',t=>{
 const f=fixture(t);f.delta.tasks=[{task_id:'REF',project_id:'PR',title:'참고',status:'in_progress',plan_source:'reference'}];
 a.equal(f.apply().ok,false);delete f.delta.tasks;
 f.delta.task_updates=[{task_id:'T',plan_source:'reference'}];a.equal(f.apply().ok,false);
});
test('merge stamps provenance, Seoul date, state and audit; replay is idempotent', t => {
 const f=fixture(t); const r=f.apply(); a.equal(r.ok,true); a.equal(r.added,3);
 const d=f.read(); a.equal(d.demoAsOf,'2026-11-21'); a.equal(d.demoNotice,'마지막 수집 2026-11-21'); a.equal(d.worklogs[0].created_run_id,'R1'); a.equal(d.runs.length,1);
 a.equal(JSON.parse(fs.readFileSync(path.join(f.dir,'state.json'))).checkpoints.drive,f.delta.checkpoints.drive);
 a.equal(f.apply().ignored,3); a.deepEqual(f.read(),d); a.equal(fs.readFileSync(path.join(f.dir,'runs.log'),'utf8').trim().split('\n').length,2);
});
for(const [name,mutate] of [
 ['conflict',d=>d.tasks=[{task_id:'T',title:'충돌'}]],
 ['missing reference',d=>d.worklogs[0].task_id='missing'],
 ['secret',d=>d.notes='token=1234567890abc'],
 ['long summary',d=>d.worklogs[0].summary='가'.repeat(161)],
 ['long source title',d=>d.sources[0].title='가'.repeat(201)],
 ['missing folder',d=>delete d.sources[0].folder_path],
 ['invalid update field',d=>d.task_updates=[{task_id:'T',version:7}]],
 ['invalid timestamp',d=>d.collected_at='yesterday']
]) test(name+' rejects entire delta without altering dataset/state',t=>{
 const f=fixture(t);const before=fs.readFileSync(f.file,'utf8');mutate(f.delta);
 const r=f.apply();a.equal(r.ok,false);a.ok(r.errors.length);a.equal(fs.readFileSync(f.file,'utf8'),before);a.equal(fs.existsSync(path.join(f.dir,'state.json')),false);
});
test('task update records before/after once; reordered input keys are identical',t=>{
 const f=fixture(t); f.delta.task_updates=[{task_id:'T',status:'completed',completed_at:'2026-11-20'}];a.equal(f.apply().ok,true);
 const h=f.read().history[0];a.equal(h.change_id,'DELTA-R1-T');a.equal(h.before.status,'in_progress');a.equal(h.after.status,'completed');a.equal(h.actor_id,'system');
 a.equal(f.apply(Object.fromEntries(Object.entries(f.delta).reverse())).ok,true);a.equal(f.read().history.length,1);
});
test('invalid task status cannot poison the next SQLite seed',t=>{
 const f=fixture(t);f.delta.task_updates=[{task_id:'T',status:'done'}];a.equal(f.apply().ok,false);a.equal(f.read().tasks[0].status,'in_progress');
});
test('I/O failure at dataset rename restores dataset, state and log',t=>{
 const f=fixture(t);a.equal(f.apply().ok,true);
 const paths=[f.file,path.join(f.dir,'state.json'),path.join(f.dir,'runs.log')];const before=paths.map(p=>fs.readFileSync(p,'utf8'));
 const rename=fs.renameSync;let failed=false;
 fs.renameSync=(from,to)=>{if(to===f.file&&!failed){failed=true;throw Object.assign(Error('test I/O failure'),{code:'EACCES'});}return rename(from,to);};
 try{a.equal(f.apply({...f.delta,run_id:'R2',task_updates:[{task_id:'T',title:'새 제목'}]}).ok,false);}finally{fs.renameSync=rename;}
 a.deepEqual(paths.map(p=>fs.readFileSync(p,'utf8')),before);a.equal(fs.readdirSync(f.dir).some(p=>p.includes('.tmp-')),false);
});
test('same key in a later run ignores identical content and refuses changed run payload',t=>{
 const f=fixture(t);a.equal(f.apply().ok,true);a.equal(f.apply({...f.delta,run_id:'R2'}).ignored,3);
 const changed=structuredClone(f.delta);changed.notes='changed';a.equal(f.apply(changed).ok,false);a.equal(f.read().runs.length,2);
});
test('CLI dry-run emits summary JSON and exit 1 on rejected input',t=>{
 const f=fixture(t);const deltaFile=path.join(f.dir,'delta.json');const cli=path.join(__dirname,'../real/apply-delta.cjs');
 const run=()=>require('node:child_process').spawnSync(process.execPath,[cli,deltaFile,'--dataset',f.file,'--dry-run'],{encoding:'utf8'});
 fs.writeFileSync(deltaFile,JSON.stringify(f.delta));let r=run();a.equal(r.status,0);a.equal(JSON.parse(r.stdout).added,3);
 f.delta.notes='SMTP_PASSWORD=example';fs.writeFileSync(deltaFile,JSON.stringify(f.delta));r=run();a.equal(r.status,1);a.equal(JSON.parse(r.stdout).ok,false);a.ok(!r.stdout.includes('SMTP_PASSWORD'));
});
test('human field correction is protected; unrelated field can change',t=>{
 const f=fixture(t);f.data.history=[{entity_type:'tasks',entity_id:'T',actor_id:'P',before:{title:'옛 제목'},after:{title:'초기'}}];fs.writeFileSync(f.file,JSON.stringify(f.data));
 f.delta.task_updates=[{task_id:'T',title:'덮기'}];a.equal(f.apply().ok,false);a.equal(f.read().tasks[0].title,'초기');
 f.delta.task_updates=[{task_id:'T',summary:'새 요약'}];a.equal(f.apply().ok,true);
});
test('checkpoint regression rejected; message does not require folder',t=>{
 const f=fixture(t);a.equal(f.apply().ok,true);f.delta.run_id='R2';f.delta.checkpoints.drive='2026-11-19T00:00:00Z';a.equal(f.apply().ok,false);
 const g=fixture(t);g.delta.sources[0].kind='message';delete g.delta.sources[0].folder_path;a.equal(g.apply().ok,true);
});
test('dry run leaves every file unchanged; active lock rejects; stale lock recovers',t=>{
 const f=fixture(t);const before=fs.readFileSync(f.file,'utf8');a.equal(f.apply(f.delta,{dryRun:true}).ok,true);a.deepEqual(fs.readdirSync(f.dir),['dataset.json']);a.equal(fs.readFileSync(f.file,'utf8'),before);
 const lock=path.join(f.dir,'apply-delta.lock');fs.writeFileSync(lock,'busy');a.equal(f.apply().ok,false);
 const old=new Date(Date.now()-31*60*1000);fs.utimesSync(lock,old,old);a.equal(f.apply().ok,true);a.equal(fs.existsSync(lock),false);
});
test('server reloads changed dataset on next request without open database rename',async t=>{
 const f=fixture(t);const {server}=createServer({dir:f.dir,seedMode:'small',realDatasetFile:f.file});
 f.setServer(server);await new Promise(r=>server.listen(0,'127.0.0.1',r));
 const get=async()=>{const r=await fetch(`http://127.0.0.1:${server.address().port}/api/view?data=real`);a.equal(r.status,200);return r.json();};
 a.equal((await get()).projects[0].tasks[0].title,'초기');f.delta.task_updates=[{task_id:'T',title:'새 제목'}];a.equal(f.apply().ok,true);
 a.equal((await get()).projects[0].tasks[0].title,'새 제목');a.equal((await get()).collectedOn,'2026-11-21');
});

test('new projects and WBS fields are accepted; updates allow clearing',t=>{
 const f=fixture(t);f.delta.projects=[{project_id:'PR2',name:'WBS'}];
 f.delta.tasks=[{task_id:'T2',project_id:'PR2',status:'in_progress',wbs_code:'1.1.1',start_date:'2026-11-01',due_date:'2026-11-30',plan_source:'wbs',plan_ref:'drive:wbs'}];
 a.equal(f.apply().ok,true);a.equal(f.read().tasks[1].wbs_code,'1.1.1');
 a.equal(f.apply({run_id:'R2',collected_at:f.delta.collected_at,task_updates:[{task_id:'T2',wbs_code:null,start_date:null,due_date:null,plan_source:null,plan_ref:null}]}).ok,true);
 a.equal(f.read().tasks[1].start_date,null);
});
for(const [key,value] of [['wbs_code','x'.repeat(17)],['wbs_code',4],['start_date','2026-02-30'],['start_date','2026-1-01'],['due_date','2026-13-01'],['plan_source','other'],['plan_ref',42]]) {
 for(const update of [false,true])test('WBS format rejects '+key+' '+update,t=>{
  const f=fixture(t);const fields={[key]:value};
  if(update)f.delta.task_updates=[{task_id:'T',...fields}];else f.delta.tasks=[{task_id:'T2',project_id:'PR',status:'in_progress',...fields}];
  a.equal(f.apply().ok,false);a.equal(f.read().tasks.length,1);
 });
}
function existingLog(f){a.equal(f.apply().ok,true);return {run_id:'R2',collected_at:f.delta.collected_at,tasks:[{task_id:'T2',project_id:'PR',status:'in_progress'}],worklog_updates:[{worklog_id:'W',task_id:'T2'}]};}
test('worklog reassignment records history, replay and unchanged values are ignored',t=>{
 const f=fixture(t),d=existingLog(f);a.equal(f.apply(d).updated,1);const h=f.read().history[0];
 a.equal(h.change_id,'DELTA-R2-W');a.equal(h.before.task_id,'T');a.equal(h.after.task_id,'T2');a.equal(h.entity_type,'worklogs');a.equal(h.actor_id,'system');
 a.equal(f.apply(d).ignored,2);a.equal(f.read().history.length,1);
 a.equal(f.apply({...d,run_id:'R3',tasks:[]}).ignored,1);a.equal(f.read().history.length,1);
});
for(const kind of ['missing task','missing worklog','duplicate','extra field','human'])test('worklog reassignment rejects '+kind,t=>{
 const f=fixture(t),d=existingLog(f);
 if(kind==='missing task')d.worklog_updates[0].task_id='missing';
 if(kind==='missing worklog')d.worklog_updates[0].worklog_id='missing';
 if(kind==='duplicate')d.worklog_updates.push({...d.worklog_updates[0]});
 if(kind==='extra field')d.worklog_updates[0].summary='forbidden';
 if(kind==='human'){const data=f.read();data.history.push({entity_type:'worklogs',entity_id:'W',actor_id:'P',before:{task_id:'old'},after:{task_id:'T'}});fs.writeFileSync(f.file,JSON.stringify(data));}
 a.equal(f.apply(d).ok,false);a.equal(f.read().worklogs[0].task_id,'T');
});

for (const target of ['tasks','task_updates']) {
 for (const description of ['😀'.repeat(200),null]) test(target+' accepts nullable Unicode description '+(description===null?'null':'200'),t=>{
  const f=fixture(t);f.delta[target]=[{task_id:target==='tasks'?'T2':'T',...(target==='tasks'?{project_id:'PR',title:'합성',status:'in_progress'}:{}),description}];
  a.equal(f.apply().ok,true);a.equal(f.read().tasks.find(x=>x.task_id===(target==='tasks'?'T2':'T')).description,description);
 });
 for (const description of ['😀'.repeat(201),42,{},'token=1234567890abc']) test(target+' rejects invalid description '+typeof description+' '+String(description).length,t=>{
  const f=fixture(t);f.delta[target]=[{task_id:target==='tasks'?'T2':'T',...(target==='tasks'?{project_id:'PR',title:'합성',status:'in_progress'}:{}),description}];
  a.equal(f.apply().ok,false);a.deepEqual(f.read(),f.data);
 });
}
const testGroups = ['2 플랫폼 비교평가','2.1 비교평가'];
for (const value of [[],testGroups,null,['가'.repeat(120)]]) test('wbs_groups accepts '+JSON.stringify(value),t=>{
 const f=fixture(t);f.delta.tasks=[{task_id:'N',project_id:'PR',title:'합성',status:'in_progress',wbs_groups:value}];
 f.delta.task_updates=[{task_id:'T',wbs_groups:value}];a.equal(f.apply().ok,true);a.deepEqual(f.read().tasks[0].wbs_groups,value);
});
for (const value of ['bad',[1],Array(5).fill('가'),['가'.repeat(121)]]) for(const mode of ['tasks','task_updates']) test('wbs_groups rejects '+mode+' '+JSON.stringify(value),t=>{
 const f=fixture(t);f.delta[mode]=[mode==='tasks'?{task_id:'N',project_id:'PR',title:'합성',status:'in_progress',wbs_groups:value}:{task_id:'T',wbs_groups:value}];a.equal(f.apply().ok,false);
});
test('wbs_groups secrets are rejected without exposing input',t=>{
 const f=fixture(t);f.delta.task_updates=[{task_id:'T',wbs_groups:['token=1234567890abc']}];const r=f.apply();a.equal(r.ok,false);a.ok(!JSON.stringify(r.errors).includes('1234567890abc'));
});
for (const target of ['tasks','task_updates']) {
 test(target+' accepts the five work types only',t=>{
  const f=fixture(t);f.delta[target]=[{task_id:target==='tasks'?'T2':'T',...(target==='tasks'?{project_id:'PR',title:'합성',status:'in_progress'}:{}),category:'검증'}];
  a.equal(f.apply().ok,true);
 });
 for (const category of ['AX 현업진단','검토','']) test(target+' rejects category '+JSON.stringify(category),t=>{
  const f=fixture(t);f.delta[target]=[{task_id:target==='tasks'?'T2':'T',...(target==='tasks'?{project_id:'PR',title:'합성',status:'in_progress'}:{}),category}];
  a.equal(f.apply().ok,false);a.deepEqual(f.read(),f.data);
 });
}
