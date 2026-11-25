const fail=(code,status=400)=>{throw Object.assign(Error(code),{code,status});};
const object=v=>v&&typeof v==='object'&&!Array.isArray(v);
const date=v=>typeof v==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(v)&&Number.isFinite(Date.parse(v))&&new Date(v).toISOString().slice(0,10)===v;
const stages=['리서치','기획','프로토타입','개발·테스트','출시·운영'];
const seoulDay=value=>new Intl.DateTimeFormat('sv-SE',{timeZone:'Asia/Seoul',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date(value));
// This function only returns a new dataset. Connectors publish it atomically.
function correct(dataset,input,actor,id,now){
 if(!object(input)||Object.keys(input).some(k=>!['entity','op','id','version','task_version','fields'].includes(k))||!object(input.fields)||!['task','worklog','review'].includes(input.entity)||!['update','create','remove','decide','reopen'].includes(input.op)||!actor||actor==='system')fail('invalid_correction');
 const {entity,op,fields}=input,table={task:'tasks',worklog:'worklogs',review:'reviews'}[entity],key=entity+'_id';
 if(op==='create'&&input.id!==undefined)fail('invalid_create_id');
 if(entity!=='review'&&'task_version'in input)fail('invalid_field');
 if(entity==='review'?!['decide','reopen'].includes(op):!['update','create','remove'].includes(op))fail('invalid_operation');
 const allowed=entity==='task'?['title','project_id','stage','owner','status','completed_at','start_date','due_date','description']:entity==='worklog'?['title','task_id','performed_at','owner']:['decision'];
 if(Object.keys(fields).some(k=>!allowed.includes(k)))fail('invalid_field');
 if(['remove','reopen'].includes(op)&&Object.keys(fields).length)fail('invalid_field');
 for(const [k,v] of Object.entries(fields)){
  if(v===null&&['stage','start_date','due_date','completed_at','description'].includes(k))continue;
  if(typeof v!=='string')fail('invalid_value');
  if(k==='title'&&(!v.trim()||[...v].length>120)||k==='description'&&[...v].length>200)fail('length_limit');
  if(['start_date','due_date','completed_at','performed_at'].includes(k)&&!date(v))fail('invalid_date');
  if(k==='stage'&&!stages.includes(v)||k==='status'&&!['진행 중','완료'].includes(v))fail('invalid_enum');
  if(k==='owner'&&!(dataset.persons||[]).some(p=>p.person_id===v))fail('owner_missing',404);
  if(k==='project_id'&&!(dataset.projects||[]).some(p=>p.project_id===v))fail('project_missing',404);
  if(k==='task_id'&&!(dataset.tasks||[]).some(t=>t.task_id===v&&!t.merged_into))fail('task_missing',404);
 }
 if(JSON.stringify(fields).match(/AIza[0-9A-Za-z_-]{20,}|token=|-----BEGIN|SMTP_PASSWORD=|KEY_JSON=/))fail('secret_pattern');
 const next=structuredClone(dataset);next[table]||=[];next.history||=[];
 const before=op==='create'?null:next[table].find(r=>r[key]===input.id);
 if(op!=='create'&&!before)fail('not_found',404);
 if(op==='create'?(input.version!==0):(!Number.isSafeInteger(input.version)||input.version!==(before.version||1)))fail('version_conflict',409);
 if(entity==='task'&&(op==='remove'||op==='update'&&'project_id'in fields&&fields.project_id!==before.project_id)&&(next.tasks||[]).some(t=>t.merged_into===input.id))fail('merge_target_referenced');
 let after=op==='create'?{[key]:id,version:1,created_at:now}:structuredClone(before);
 if(op==='create'){next.runs||=[];next.runs.push({run_id:id,state:'complete'});after.run_id=id;}
 const values={...fields};
 if('owner'in values){values[entity==='task'?'assignee_id':'performer_id']=values.owner;delete values.owner;}
 if(entity==='task'&&'status'in values)values.status=values.status==='완료'?'completed':'in_progress';
 if(entity==='task'&&values.status==='in_progress')values.completed_at=null;
 Object.assign(after,values);
 if(op!=='create')after.version=(before.version||1)+1;
 if(entity==='task'&&op!=='remove'){
  if(op==='create'&&(!fields.title||!fields.project_id||!fields.owner))fail('required_field');
  if(after.start_date&&after.due_date&&after.start_date>after.due_date)fail('invalid_range');
  if(after.status==='completed'&&!date(after.completed_at))fail('completion_date_required');
  after.status||='in_progress';after.category||='제작·구현';after.plan_source||='activity';
  if(after.status!=='completed')after.completed_at=null;
 }
 if(entity==='worklog'&&op!=='remove'){
  if(op==='create'&&(!fields.title||!fields.task_id||!fields.performed_at||!fields.owner))fail('required_field');
  if('performed_at'in fields)after.performed_at_precision='date';
  after.summary=after.title;
 }
 if(entity==='review'){
  if(before.kind&&before.kind!=='completion'||before.subject_type!=='task')fail('invalid_review');
  if(op==='decide'&&!['완료','진행 중'].includes(fields.decision))fail('invalid_decision');
  after.status=op==='reopen'?'open':'decided';after.decision=op==='reopen'?null:fields.decision;
  const task=next.tasks.find(t=>t.task_id===before.subject_id);if(!task)fail('task_missing',404);
  if(!Number.isSafeInteger(input.task_version)||input.task_version!==(task.version||1))fail('version_conflict',409);
  const old=structuredClone(task);
  task.status=op==='reopen'?'completion_proposed':fields.decision==='완료'?'completed':'in_progress';
  task.completed_at=task.status==='completed'?(task.completed_at||seoulDay(now)):null;task.version=(task.version||1)+1;
  next.history.push({change_id:id+'-task',entity_type:'tasks',entity_id:task.task_id,actor_id:actor,before:old,after:structuredClone(task),reason:'human review correction',result:'applied',applied_at:now});
 }
 if(op==='remove'){
  const removed=entity==='task'?[before,...(next.worklogs||[]).filter(w=>w.task_id===input.id)]:[before];
  next.suppressions||=[];
  for(const row of removed){const type=row.worklog_id?'worklog':'task',rid=row[type+'_id'];next.suppressions.push({suppression_id:id+'-'+rid,target_type:type,target_id:rid,scope:'source',human_decision:true,released_at:null,source_keys:(next.links||[]).filter(l=>l.target_type===type&&l.target_id===rid).flatMap(l=>[l.evidence_key,...(next.sourceEvents||[]).filter(e=>l.evidence_type==='event'&&e.event_key===l.evidence_key).map(e=>e.source_key)])});if(row!==before)next.history.push({change_id:id+'-'+rid,entity_type:'worklogs',entity_id:rid,actor_id:actor,before:row,after:null,reason:'human task removal',result:'applied',applied_at:now});}
  const logIds=new Set(removed.map(r=>r.worklog_id).filter(Boolean));
  next.worklogs=(next.worklogs||[]).filter(w=>!logIds.has(w.worklog_id));
  next.links=(next.links||[]).filter(l=>!(l.target_type===entity&&l.target_id===input.id)&&!(l.target_type==='worklog'&&logIds.has(l.target_id)));
  if(entity==='task')next.reviews=(next.reviews||[]).filter(r=>r.subject_id!==input.id);
  next[table]=next[table].filter(r=>r[key]!==input.id);after=null;
 }else if(op==='create'){next[table].push(after);}else{next[table]=next[table].map(r=>r[key]===input.id?after:r);}
 next.history.push({change_id:id,entity_type:table,entity_id:input.id||id,actor_id:actor,before:before||null,after,reason:'human correction '+op,result:'applied',applied_at:now});
 return {dataset:next,result:{ok:true,id:input.id||id,version:after?.version||null}};
}
module.exports={correct};
