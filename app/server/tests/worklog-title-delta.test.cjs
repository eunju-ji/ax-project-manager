const {test}=require('node:test'),a=require('node:assert/strict');const {merge}=require('../real/apply-delta.cjs');
const fixture=()=>({persons:[{person_id:'p'}],projects:[{project_id:'pr'}],tasks:['t','other'].map(task_id=>({task_id,project_id:'pr',status:'in_progress'})),worklogs:[{worklog_id:'w',task_id:'t',title:'core adapter 분리',summary:'기존 요약',performed_at:'2026-11-24T16:00:00Z',performed_at_precision:'exact',performer_id:'p',version:1}],history:[]});
const delta=update=>({run_id:'rename',collected_at:'2026-11-25T00:00:00Z',worklog_updates:[{worklog_id:'w',...update}]});
test('worklog title delta supports title-only and combined moves with system history',()=>{
 for(const fields of [{title:'다른 무료 서버에서도 관리장을 쓸 수 있게 정리'},{task_id:'other',title:'다른 무료 서버에서도 관리장을 쓸 수 있게 정리'}]){const d=fixture(),r=merge(d,{},delta(fields));a.equal(r.ok,true);const w=r.dataset.worklogs[0];a.equal(w.title,fields.title);a.equal(w.task_id,fields.task_id||'t');a.equal(w.version,2);a.equal(w.performed_at,d.worklogs[0].performed_at);a.equal(w.summary,'기존 요약');const h=r.dataset.history.at(-1);a.equal(h.actor_id,'system');a.equal(h.before.title,d.worklogs[0].title);a.equal(h.after.title,fields.title);}
});
test('worklog title delta validates 160 characters, rejects raw fields and protects human titles',()=>{
 a.equal(merge(fixture(),{},delta({title:'가'.repeat(160)})).ok,true);
 for(const fields of [{title:'가'.repeat(161)},{title:''},{title:12},{title:'쉬운 제목',body:'raw'}])a.equal(merge(fixture(),{},delta(fields)).ok,false);
 const d=fixture();d.history.push({entity_type:'worklogs',entity_id:'w',actor_id:'human',before:{title:'old'},after:{title:d.worklogs[0].title}});const r=merge(d,{},delta({title:'자동 변경',task_id:'other'}));a.equal(r.ok,false);a.equal(r.errors[0].code,'human_correction_protected');a.equal(d.worklogs[0].task_id,'t');
 const move=merge(d,{},delta({task_id:'other'}));a.equal(move.ok,true);
});
