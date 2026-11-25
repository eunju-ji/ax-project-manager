import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createMemoryStorage} from '../src/storage.js';

const dataset={persons:[{person_id:'P1',display_name:'Synthetic'}],projects:[{project_id:'PR1',owner_id:'P1',name:'Synthetic'}],tasks:[{task_id:'T1',project_id:'PR1',assignee_id:'P1',status:'in_progress',version:1}],reviews:[{review_id:'R1',task_id:'T1',kind:'completion',status:'open'}]};
test('human completion survives conflicting delta, replay and unrelated update',async()=>{
 const storage=createMemoryStorage({dataset});
 const decision={answer:'완료',review_id:'R1',change_id:'C1',expected_version:1};
 await storage.decide(decision);
 await storage.decide(decision);
 const delta={run_id:'reopen',collected_at:'2026-11-25T00:00:00Z',task_updates:[{task_id:'T1',status:'in_progress'}]};
 const rejected=await storage.applyDelta(delta);
 assert.equal(rejected.ok,false);
 assert.ok(rejected.errors.some(e=>e.code==='human_correction_protected'));
 assert.equal((await storage.view()).taskStates[0].status,'completed');
 assert.equal((await storage.view()).taskStates[0].version,2);
 const allowed=await storage.applyDelta({...delta,run_id:'rename',task_updates:[{task_id:'T1',title:'Scheduled title'}]});
 assert.equal(allowed.ok,true);
 const history=allowed.dataset.history.filter(h=>h.actor_id==='P1');
 assert.equal(history.length,1);
 assert.equal(history[0].entity_type,'tasks');
 assert.equal(history[0].entity_id,'T1');
 assert.equal(history[0].before.status,'in_progress');
 assert.equal(history[0].after.status,'completed');
 assert.equal(history[0].result,'applied');
 assert.ok(Number.isFinite(Date.parse(history[0].applied_at)));
});

test('failed decision leaves status and human history unchanged',async()=>{
 const storage=createMemoryStorage({dataset});
 await assert.rejects(storage.decide({answer:'완료',review_id:'R1',change_id:'bad',expected_version:7}));
 const result=await storage.applyDelta({run_id:'still-system-editable',collected_at:'2026-11-25T00:00:00Z',task_updates:[{task_id:'T1',status:'completion_proposed'}]});
 assert.equal(result.ok,true);
 assert.equal(result.dataset.history.filter(h=>h.actor_id!=='system').length,0);
});
