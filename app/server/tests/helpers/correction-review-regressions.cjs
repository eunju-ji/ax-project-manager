const fixture=()=>({persons:[{person_id:'P1',display_name:'Synthetic'}],projects:[{project_id:'p',name:'Project'},{project_id:'q',name:'Other project'}],tasks:[{task_id:'t',project_id:'p',title:'Task',status:'in_progress',version:1},{task_id:'other',project_id:'p',title:'Other',status:'in_progress',version:1},{task_id:'merged',project_id:'p',title:'Merged',status:'in_progress',merged_into:'t',version:1}],reviews:[{review_id:'r',subject_id:'t',subject_type:'task',kind:'completion',status:'open',version:1}],runs:[{run_id:'seed',state:'complete'}],worklogs:[{worklog_id:'w',task_id:'t',title:'Work',summary:'Work',performer_id:'P1',performed_at:'2026-11-24T16:30:00Z',performed_at_precision:'exact',version:1,run_id:'seed'}]});
const task=v=>v.projects.flatMap(p=>p.tasks).find(t=>t.id==='t');
const log=v=>v.projects.flatMap(p=>p.tasks.flatMap(t=>t.subtasks)).find(w=>w.id==='w');
const cases=[
 ['stale review conflicts with a newer task completion',async(a,h)=>{
  await h.correct({entity:'task',op:'update',id:'t',version:1,fields:{status:'완료',completed_at:'2026-11-25'}});
  for(const op of ['decide','reopen'])await a.rejects(()=>h.correct({entity:'review',op,id:'r',version:1,task_version:1,fields:op==='decide'?{decision:'진행 중'}:{}}),e=>e.status===409);
  a.equal(task(await h.view()).status,'completed');a.equal(task(await h.view()).completedAt,'2026-11-25');
 }],
 ['work edits retain exact KST day until an explicit date edit',async(a,h)=>{
  let version=1;for(const fields of [{title:'Renamed'},{task_id:'other'},{owner:'P1'}]){await h.correct({entity:'worklog',op:'update',id:'w',version:version++,fields});const w=log(await h.view());a.equal(w.performedAt,'2026-11-24T16:30:00Z');a.equal(w.performedAtPrecision,'exact');a.equal(require('../../../src/model.js').day(w.performedAt),'2026-11-25');}
  await h.correct({entity:'worklog',op:'update',id:'w',version,fields:{performed_at:'2026-11-26'}});const w=log(await h.view());a.equal(w.performedAt,'2026-11-26');a.equal(w.performedAtPrecision,'date');
 }],
 ['merge targets reject delete and cross-project moves',async(a,h)=>{
  for(const [op,fields] of [['remove',{}],['update',{project_id:'q'}]])await a.rejects(()=>h.correct({entity:'task',op,id:'t',version:1,fields}),e=>e.status===400&&e.code==='merge_target_referenced');
  a.equal(task(await h.view()).title,'Task');a.equal((await h.view()).correctionData.tasks.find(t=>t.id==='t').version,1);
 }],
 ['review completion uses the Seoul date after 15:00 UTC',async(a,h)=>{
  await h.correct({entity:'review',op:'decide',id:'r',version:1,task_version:1,fields:{decision:'완료'}});a.equal(task(await h.view()).completedAt,'2026-11-25');
 }]
];
module.exports={fixture,cases};
