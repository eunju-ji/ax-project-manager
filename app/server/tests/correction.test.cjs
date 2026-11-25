const {test}=require('node:test');const a=require('node:assert/strict');
const {correct}=require('../core/correction.cjs');
const fixture=()=>({persons:[{person_id:'P1'}],projects:[{project_id:'p'}],tasks:[{task_id:'t',project_id:'p',title:'before',status:'in_progress',version:1}],worklogs:[],reviews:[]});
test('correction validates fields, target and optimistic version, audits actual actor',()=>{
 const d=fixture(),input={entity:'task',op:'update',id:'t',version:1,fields:{title:'after'}};
 const r=correct(d,input,'login-user','id','2026-11-25T00:00:00Z');a.equal(r.dataset.tasks[0].title,'after');a.equal(r.dataset.history[0].actor_id,'login-user');a.equal(d.tasks[0].title,'before');
 for(const [patch,status] of [[{version:2},409],[{id:'missing'},404],[{fields:{body:'raw'}},400],[{fields:{title:'x'.repeat(121)}},400],[{fields:{due_date:'2026-02-30'}},400]])a.throws(()=>correct(d,{...input,...patch},'user','id','2026-11-25T00:00:00Z'),e=>e.status===status);
});
test('removal saves suppressions and review reopen retains full history',()=>{
 const d=fixture();d.reviews=[{review_id:'r',subject_id:'t',subject_type:'task',status:'decided',version:1,decision:'완료'}];
 const r=correct(d,{entity:'review',op:'reopen',id:'r',version:1,fields:{}},'user','id','2026-11-25T00:00:00Z');a.equal(r.dataset.reviews[0].status,'open');a.equal(r.dataset.history.length,2);
 const removed=correct(d,{entity:'task',op:'remove',id:'t',version:1,fields:{}},'user','remove','2026-11-25T00:00:00Z');a.equal(removed.dataset.tasks.length,0);a.equal(removed.dataset.suppressions[0].target_id,'t');
});
test('manual create, move and removal remain visible and cannot be overwritten or resurrected',()=>{
 const {merge}=require('../real/apply-delta.cjs');let d=fixture();d.projects.push({project_id:'q'});
 d=correct(d,{entity:'task',op:'create',version:0,fields:{title:'manual',project_id:'q',owner:'P1',stage:'기획'}},'login','newtask','2026-11-25T00:00:00Z').dataset;
 d=correct(d,{entity:'worklog',op:'create',version:0,fields:{title:'manual work',task_id:'t',performed_at:'2026-11-25',owner:'P1'}},'login','newlog','2026-11-25T00:00:00Z').dataset;
 d=correct(d,{entity:'worklog',op:'update',id:'newlog',version:1,fields:{task_id:'newtask'}},'login','move','2026-11-25T00:00:00Z').dataset;
 a.equal(require('../../src/adapter.js').adapt(d).projects.find(p=>p.id==='q').tasks[0].subtasks.length,1);
 const delta={run_id:'collect',collected_at:'2026-11-25T00:00:00Z',worklog_updates:[{worklog_id:'newlog',task_id:'t'}]};a.equal(merge(d,{},delta).errors[0].code,'human_correction_protected');
 d=correct(d,{entity:'task',op:'remove',id:'newtask',version:1,fields:{}},'login','remove','2026-11-25T00:00:00Z').dataset;
 a.equal(d.worklogs.length,0);a.ok(d.history.some(h=>h.entity_id==='newlog'&&h.after===null));
 const replay=merge(d,{}, {...delta,worklog_updates:[],tasks:[{task_id:'newtask',title:'reborn',project_id:'q'}]});a.equal(replay.ok,false);a.equal(replay.errors[0].code,'human_correction_protected');
});
test('automatic task updates invalidate an open human form version',()=>{
 const {merge}=require('../real/apply-delta.cjs');const r=merge(fixture(),{},{run_id:'new-auto',collected_at:'2026-11-25T00:00:00Z',task_updates:[{task_id:'t',title:'automatic'}]});a.equal(r.ok,true);
 a.throws(()=>correct(r.dataset,{entity:'task',op:'update',id:'t',version:1,fields:{title:'stale'}},'user','id','2026-11-25T00:00:00Z'),e=>e.status===409);
});
test('removing event-backed work blocks recreation from the same source',()=>{
 const d=fixture();d.sourceEvents=[{event_key:'E1',source_key:'S'},{event_key:'E2',source_key:'S'}];d.worklogs=[{worklog_id:'w',task_id:'t',version:1}];d.links=[{link_id:'l',target_type:'worklog',target_id:'w',evidence_type:'event',evidence_key:'E1'}];
 const saved=correct(d,{entity:'worklog',op:'remove',id:'w',version:1,fields:{}},'user','remove','2026-11-25T00:00:00Z').dataset;
 a.ok(saved.suppressions[0].source_keys.includes('S'));
 const r=require('../real/apply-delta.cjs').merge(saved,{}, {run_id:'recreate',collected_at:'2026-11-25T00:00:00Z',links:[{link_id:'new',target_type:'task',target_id:'t',evidence_type:'event',evidence_key:'E2',status:'confirmed'}]});a.equal(r.ok,false);a.equal(r.errors[0].code,'human_correction_protected');
});

