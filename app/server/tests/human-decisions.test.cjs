const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {merge,applyDelta}=require('../real/apply-delta.cjs');

test('core rejects delta overwriting a human decision history field',()=>{
 const dataset={persons:[],projects:[{project_id:'PR1'}],tasks:[{task_id:'T1',project_id:'PR1',status:'completed'}],history:[{change_id:'C1',entity_type:'tasks',entity_id:'T1',actor_id:'P1',before:{status:'in_progress',version:1},after:{status:'completed',version:2},result:'applied',applied_at:'2026-11-25T00:00:00Z'}]};
 const result=merge(dataset,{}, {run_id:'reopen',collected_at:'2026-11-25T00:00:00Z',task_updates:[{task_id:'T1',status:'in_progress'}]});
 assert.equal(result.ok,false);
 assert.ok(result.errors.some(e=>e.code==='human_correction_protected'));
 assert.equal(dataset.tasks[0].status,'completed');
});

test('Node decision change_log protects file delta and survives a subsequent reload',async t=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'ax-human-decision-'));
 const dataset=path.join(dir,'real-dataset.json');
 const data=require('../api/server.cjs').small();
 fs.writeFileSync(dataset,JSON.stringify(data));
 const db=require('../repo/sqlite/index.cjs').open(path.join(dir,'real.sqlite'));
 t.after(()=>{db.close();fs.rmSync(dir,{recursive:true,force:true});});
 require('../repo/sqlite/records.cjs').seed(db,data);
 require('../repo/sqlite/seed-file.cjs').mark(db,data);
 await new (require('../service/index.cjs').Service)(db).decide({answer:'완료',review_id:'RV-1',change_id:'C1',expected_version:1});
 const delta={run_id:'reopen',collected_at:'2026-11-25T00:00:00Z',task_updates:[{task_id:'TSK-LOCAL',status:'in_progress'}]};
 const rejected=applyDelta(delta,{dataset});
 assert.equal(rejected.ok,false);
 assert.ok(rejected.errors.some(e=>e.code==='human_correction_protected'));
 const allowed=applyDelta({...delta,run_id:'rename',task_updates:[{task_id:'TSK-LOCAL',title:'Scheduled title'}]},{dataset});
 assert.equal(allowed.ok,true);
 const saved=JSON.parse(fs.readFileSync(dataset));
 assert.equal(saved.tasks[0].status,'completed');
 assert.ok(saved.history.some(h=>h.entity_id==='TSK-LOCAL'&&h.actor_id==='P1'&&h.after.status==='completed'));
 assert.equal(applyDelta({...delta,run_id:'reopen-again'},{dataset}).ok,false);
});
