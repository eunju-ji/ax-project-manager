const test = require('node:test');
const a = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { applyDelta } = require('../real/apply-delta.cjs');
const { createServer } = require('../api/server.cjs');
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
