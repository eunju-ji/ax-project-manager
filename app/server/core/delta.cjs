const KEYS = { persons:'person_id', projects:'project_id', tasks:'task_id', worklogs:'worklog_id', sources:'source_key', links:'link_id' };
const UPDATE_FIELDS = new Set(['stage','merged_into','wbs_groups','description','status','completed_at','completion_basis','due_date','due_basis','title','summary','category','assignee_id','project_id','wbs_code','start_date','plan_source','plan_ref']);
const PROJECT_FIELDS = new Set(['kind','name','purpose','display_owner','owner_id','deputy_id']);
const SECRET = /AIza[0-9A-Za-z_-]{20,}|token=[A-Za-z0-9_-]{10,}|SMTP_PASSWORD=|KEY_JSON=|-----BEGIN/;
const object = v => v !== null && typeof v === 'object' && !Array.isArray(v);
const iso = v => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/.test(v) && Number.isFinite(Date.parse(v));
function canonical(v) {
 if (Array.isArray(v)) return v.map(canonical);
 if (object(v)) return Object.fromEntries(Object.keys(v).sort().map(k => [k,canonical(v[k])]));
 return v;
}

const dateOnly = v => typeof v==='string' && /^\d{4}-\d{2}-\d{2}$/.test(v) && Number.isFinite(Date.parse(v)) && new Date(v).toISOString().slice(0,10)===v;
// ADR-003 업무 유형 5종. WBS 카테고리명 등 다른 값은 거부한다.
const CATEGORIES = ['기획·설계','조사·분석','제작·구현','검증','운영·지원'];
const validCategory = row => !('category' in row) || CATEGORIES.includes(row.category);
const validDescription = row => !('description' in row) || row.description === null || (typeof row.description === 'string' && [...row.description].length <= 200);
const validGroups = row => !('wbs_groups' in row) || row.wbs_groups === null || (Array.isArray(row.wbs_groups) && row.wbs_groups.length <= 4 && row.wbs_groups.every(v=>typeof v==='string' && [...v].length<=120));
const validKind = row => !('kind' in row) || ['core','ops'].includes(row.kind);
const validStage = row => !('stage' in row) || row.stage === null || ['리서치','기획','프로토타입','개발·테스트','출시·운영'].includes(row.stage);
function validPlan(row, nullable=false) {
 return ['wbs_code','start_date','due_date','plan_source','plan_ref'].every(k=>{
  if (!(k in row)) return true;
  const v=row[k];if(v===null)return nullable;
  if(k==='start_date'||k==='due_date')return dateOnly(v);
  if(k==='plan_source')return ['wbs','activity'].includes(v);
  return typeof v==='string' && (k!=='wbs_code'||[...v].length<=16);
 });
}
function humanChanged(dataset,type,id,field,equal) {
 return (dataset.history||[]).some(h=>h.entity_type===type&&h.entity_id===id&&h.actor_id!=='system'&&!equal(h.before?.[field],h.after?.[field]));
}
const counts = d => Object.keys(KEYS).reduce((n,k)=>n+(d[k]?.length||0),0)+(d.task_updates?.length||0)+(d.worklog_updates?.length||0)+(d.project_updates?.length||0)+(d.worklog_removals?.length||0)+(d.task_removals?.length||0)+['project_removals','person_removals','source_removals','person_updates','history_purges'].reduce((n,k)=>n+(d[k]?.length||0),0);

// No input values in errors: rejected input may itself contain credentials.
function merge(dataset, state, delta, {digest, equal}) {
 const errors = [];
 const reject = (code, location) => errors.push({code,location});
 const result = {ok:false,added:0,updated:0,removed:0,ignored:0,rejected:0,errors};
 const fail = () => ({...result,added:0,updated:0,removed:0,rejected:errors.length});
 if (!object(delta)) { reject('object_required','delta'); return fail(); }
 if (typeof delta.run_id !== 'string' || !/^[A-Za-z0-9_-]{1,64}$/.test(delta.run_id)) reject('invalid_run_id','run_id');
 if (!iso(delta.collected_at)) reject('invalid_iso','collected_at');
 const allowed = new Set(['run_id','collected_at','checkpoints',...Object.keys(KEYS),'task_updates','worklog_updates','project_updates','worklog_removals','task_removals','project_removals','person_removals','source_removals','person_updates','purge','history_purges','notes']);
 for (const k of Object.keys(delta)) if (!allowed.has(k)) reject('unknown_field','delta');
 if (SECRET.test(JSON.stringify(delta))) reject('secret_pattern','delta');
 for (const k of [...Object.keys(KEYS),'task_updates','worklog_updates','project_updates','person_updates']) if (delta[k] !== undefined && (!Array.isArray(delta[k]) || delta[k].some(r=>!object(r)))) reject('record_array_required',k);
 for (const k of ['worklog_removals','task_removals','project_removals','person_removals','source_removals']) if (delta[k] !== undefined && (!Array.isArray(delta[k]) || delta[k].some(id=>typeof id!=='string'||!id.length))) reject('id_array_required',k);
 if(delta.purge!==undefined&&typeof delta.purge!=='boolean')reject('boolean_required','purge');
 // 이미 지워진 대상의 이력만 내용째 지운다(purge 전용).
 if(delta.history_purges!==undefined&&(delta.purge!==true||!Array.isArray(delta.history_purges)||delta.history_purges.some(r=>!object(r)||Object.keys(r).some(k=>!['entity_type','entity_id'].includes(k))||!(r.entity_type in KEYS)||typeof r.entity_id!=='string'||!r.entity_id)))reject('invalid_history_purge','history_purges');
 if (delta.checkpoints !== undefined && !object(delta.checkpoints)) reject('object_required','checkpoints');
 for (const [k,v] of Object.entries(object(delta.checkpoints)?delta.checkpoints:{})) {
  if (!['drive','chat','gmail','github','ai_chats'].includes(k) || !iso(v)) reject('invalid_checkpoint','checkpoints');
 }
 if (errors.length) return fail();
 const inputDigest = digest(delta);
 const prior = state.applied_runs?.[delta.run_id];
 if (prior) {
  if (prior !== inputDigest) { reject('run_id_reused','run_id'); return fail(); }
  return {...result,ok:true,ignored:counts(delta),dataset,state,replay:true};
 }
 if ((dataset.runs||[]).some(r=>r.run_id===delta.run_id)) { reject('untracked_run_id','run_id'); return fail(); }
 for (const [k,v] of Object.entries(delta.checkpoints||{})) {
  if (state.checkpoints?.[k] && (!iso(state.checkpoints[k]) || Date.parse(v)<Date.parse(state.checkpoints[k]))) reject('checkpoint_regression',`checkpoints.${k}`);
 }
 const next = structuredClone(dataset);
 const suppressedEvidence=(s,l)=>[l.evidence_key,...(dataset.sourceEvents||[]).filter(e=>l.evidence_type==='event'&&e.event_key===l.evidence_key).map(e=>e.source_key)].some(k=>(s.source_keys||[]).includes(k));
 const stamp = r => ({...r,run_id:delta.run_id,created_run_id:delta.run_id});
 for (const [table,key] of Object.entries(KEYS)) {
  next[table] ||= [];
  const index = new Map(next[table].map(r=>[r[key],r]));
  for (const [i,row] of (delta[table]||[]).entries()) {
   const loc = `${table}[${i}]`;
   if (typeof row[key] !== 'string' || !row[key].length) { reject('missing_key',loc); continue; }
   if((dataset.suppressions||[]).some(s=>!s.released_at&&s.human_decision&&(s.target_id===row[key]&&s.target_type===({tasks:'task',worklogs:'worklog'}[table])||['tasks','worklogs'].includes(table)&&(s.source_keys||[]).includes(row.source_key)))){reject('human_correction_protected',loc);continue;}
   if((dataset.suppressions||[]).some(s=>!s.released_at&&s.human_decision&&(table==='links'&&suppressedEvidence(s,row)||(delta.links||[]).some(l=>l.target_id===row[key]&&suppressedEvidence(s,l))))){reject('human_correction_protected',loc);continue;}
   if (['projects','tasks'].includes(table) && !/^[A-Za-z0-9_-]{1,64}$/.test(row[key])) reject('invalid_key',loc);
   if (table==='projects' && !validKind(row)) reject('invalid_kind',loc);
   if (table==='tasks' && !validStage(row)) reject('invalid_stage',loc);
   if (table==='tasks' && !validGroups(row)) reject('invalid_wbs_groups',loc);
   if (table==='tasks' && !validDescription(row)) reject('description_limit',loc);
   if (table==='tasks' && !validCategory(row)) reject('invalid_category',loc);
   if (table==='tasks' && !validPlan(row)) reject('invalid_plan_field',loc);
   if (table==='worklogs' && (typeof row.summary!=='string' || [...row.summary].length>160)) reject('summary_limit',loc);
   if (table==='sources') {
    if (typeof row.title!=='string' || [...row.title].length>200) reject('title_limit',loc);
    if (typeof row.kind!=='string' || (!['message','commit','pull_request','issue','ai_chat'].includes(row.kind) && (!Array.isArray(row.folder_path) || row.folder_path.some(p=>typeof p!=='string')))) reject('folder_path_required',loc);
   }
   // Bodies are never part of the digest dataset contract.
   if (['body','raw','raw_body','content','message_body','html_body','diff','patch','messages','chat_messages'].some(k=>k in row)) reject('raw_content_forbidden',loc);
   const existing = index.get(row[key]);
   if (existing) {
    const strip = r => Object.fromEntries(Object.entries(r).filter(([k])=>!['run_id','created_run_id'].includes(k)));
    if (equal(strip(existing),strip(row))) result.ignored++;
    else reject('record_conflict',loc);
   } else { const added=stamp(row); next[table].push(added);index.set(row[key],added);result.added++; }
  }
 }
 next.history ||= [];
 const seenPersons=new Set();
 for(const [i,u] of (delta.person_updates||[]).entries()){
  const loc='person_updates['+i+']',p=next.persons.find(p=>p.person_id===u.person_id);
  if(!p||seenPersons.has(u.person_id)){reject('missing_or_duplicate_person',loc);continue;}seenPersons.add(u.person_id);
  if(Object.keys(u).some(k=>!['person_id','display_name'].includes(k))||typeof u.display_name!=='string'||![...u.display_name].length||[...u.display_name].length>80){reject('invalid_person_update',loc);continue;}
  if(p.display_name===u.display_name){result.ignored++;continue;}
  if(humanChanged(dataset,'persons',u.person_id,'display_name',equal)){reject('human_correction_protected',loc);continue;}
  const before=structuredClone(p);p.display_name=u.display_name;
  next.history.push({change_id:'DELTA-'+delta.run_id+'-'+u.person_id,entity_type:'persons',entity_id:u.person_id,before,after:structuredClone(p),actor_id:'system',reason:'scheduled-collect person update',run_id:delta.run_id,result:'applied',applied_at:delta.collected_at});result.updated++;
 }
 const seenProjects = new Set();
 for (const [i,update] of (delta.project_updates||[]).entries()) {
  const loc=`project_updates[${i}]`;
  const project=next.projects.find(p=>p.project_id===update.project_id);
  if (!project || seenProjects.has(update.project_id)) {reject('missing_or_duplicate_project',loc);continue;}
  seenProjects.add(update.project_id);
  const fields=Object.keys(update).filter(k=>k!=='project_id');
  if (!validKind(update)) {reject('invalid_kind',loc);continue;}
  if (fields.some(k=>!PROJECT_FIELDS.has(k))) {reject('invalid_update_field',loc);continue;}
  if (fields.some(k=>typeof update[k]!=='string')) {reject('invalid_update_value',loc);continue;}
  if (('name' in update && [...update.name].length>120) || ('purpose' in update && [...update.purpose].length>200)) {reject('project_text_limit',loc);continue;}
  const changed=fields.filter(k=>!equal(project[k],update[k]));
  if (changed.some(k=>humanChanged(dataset,'projects',update.project_id,k,equal))) {reject('human_correction_protected',loc);continue;}
  if (!changed.length) {result.ignored++;continue;}
  const before=structuredClone(project);
  Object.assign(project,Object.fromEntries(changed.map(k=>[k,update[k]])));
  next.history.push({change_id:`DELTA-${delta.run_id}-${update.project_id}`,entity_type:'projects',entity_id:update.project_id,before,after:structuredClone(project),actor_id:'system',reason:'scheduled-collect project update',run_id:delta.run_id,result:'applied',applied_at:delta.collected_at});
  result.updated++;
 }
 const seenUpdates = new Set();
 for (const [i,update] of (delta.task_updates||[]).entries()) {
  const loc = `task_updates[${i}]`;
  const task = next.tasks.find(t=>t.task_id===update.task_id);
  if (!task || seenUpdates.has(update.task_id)) { reject('missing_or_duplicate_task',loc); continue; }
  seenUpdates.add(update.task_id);
  const fields = Object.keys(update).filter(k=>k!=='task_id');
  if (fields.some(k=>!UPDATE_FIELDS.has(k))) { reject('invalid_update_field',loc); continue; }
  if (fields.some(k=>k!=='wbs_groups' && update[k]!==null && typeof update[k]!=='string')) { reject('invalid_update_value',loc); continue; }
  if (!validStage(update)) {reject('invalid_stage',loc);continue;}
  if (!validGroups(update)) { reject('invalid_wbs_groups',loc); continue; }
  if (!validDescription(update)) { reject('description_limit',loc); continue; }
  if (!validCategory(update)) { reject('invalid_category',loc); continue; }
  if (!validPlan(update,true)) { reject('invalid_plan_field',loc); continue; }
  const changed = fields.filter(k=>!equal(task[k],update[k]));
  const protectedFields = new Set();
  for (const h of dataset.history||[]) {
   if (h.entity_type!=='tasks' || h.entity_id!==update.task_id || h.actor_id==='system') continue;
   for (const k of new Set([...Object.keys(h.before||{}),...Object.keys(h.after||{})])) {
    if (!equal(h.before?.[k],h.after?.[k])) protectedFields.add(k);
   }
  }
  if (changed.some(k=>protectedFields.has(k))) { reject('human_correction_protected',loc); continue; }
  if (!changed.length) {result.ignored++;continue;}
  const before=structuredClone(task);
  Object.assign(task,Object.fromEntries(changed.map(k=>[k,update[k]])));
  task.version=(task.version||1)+1;
  next.history.push({change_id:`DELTA-${delta.run_id}-${update.task_id}`,entity_type:'tasks',entity_id:update.task_id,before,after:structuredClone(task),actor_id:'system',reason:'scheduled-collect task update',run_id:delta.run_id,result:'applied',applied_at:delta.collected_at});
  result.updated++;
 }
 const seenWorklogs = new Set();
 for (const [i,update] of (delta.worklog_updates||[]).entries()) {
  const loc=`worklog_updates[${i}]`;
  if(Object.keys(update).some(k=>!['worklog_id','task_id'].includes(k)) || typeof update.worklog_id!=='string' || typeof update.task_id!=='string') {reject('invalid_worklog_update',loc);continue;}
  const worklog=(dataset.worklogs||[]).find(w=>w.worklog_id===update.worklog_id);
  if(!worklog||seenWorklogs.has(update.worklog_id)){reject('missing_or_duplicate_worklog',loc);continue;}
  seenWorklogs.add(update.worklog_id);
  if(!next.tasks.some(t=>t.task_id===update.task_id)){reject('missing_task',loc);continue;}
  if(worklog.task_id===update.task_id){result.ignored++;continue;}
  if(humanChanged(dataset,'worklogs',update.worklog_id,'task_id',equal)){reject('human_correction_protected',loc);continue;}
  const target=next.worklogs.find(w=>w.worklog_id===update.worklog_id);
  const before={task_id:target.task_id};target.task_id=update.task_id;target.version=(target.version||1)+1;
  next.history.push({change_id:`DELTA-${delta.run_id}-${update.worklog_id}`,entity_type:'worklogs',entity_id:update.worklog_id,before,after:{task_id:target.task_id},actor_id:'system',reason:'scheduled-collect worklog update',run_id:delta.run_id,result:'applied',applied_at:delta.collected_at});
  result.updated++;
 }
 // Apply removals after all additions and updates, before final reference validation.
 for (const [table,key,targetType] of [['worklogs','worklog_id','worklog'],['tasks','task_id','task'],['projects','project_id','project'],['persons','person_id','person'],['sources','source_key','source']]) {
  const field=targetType+'_removals',seen=new Set();
  for (const [i,id] of (delta[field]||[]).entries()) {
   const loc=`${field}[${i}]`;
   const original=(dataset[table]||[]).find(r=>r[key]===id);
   if (!original || seen.has(id)) {reject('missing_or_duplicate_removal',loc);continue;}
   seen.add(id);
   // Avoid multiple changes with the same history ID and ambiguous add/remove runs.
   if ((delta[table]||[]).some(r=>r[key]===id) || (delta[targetType+'_updates']||[]).some(r=>r[key]===id)) {reject('conflicting_removal',loc);continue;}
   if ((dataset.history||[]).some(h=>h.entity_type===table&&h.entity_id===id&&h.actor_id!=='system')) {reject('human_correction_protected',loc);continue;}
   if (table==='tasks' && next.worklogs.some(w=>w.task_id===id)) {reject('task_has_worklogs',loc);continue;}
   if (table==='tasks' && next.tasks.some(t=>t.task_id!==id&&t.merged_into===id)) {reject('task_is_merge_target',loc);continue;}
   if(table==='projects'&&next.tasks.some(t=>t.project_id===id)){reject('project_has_tasks',loc);continue;}
   if(table==='persons'&&(next.tasks.some(t=>t.assignee_id===id)||next.worklogs.some(w=>w.performer_id===id)||next.projects.some(p=>p.owner_id===id||p.deputy_id===id))){reject('person_referenced',loc);continue;}
   if(table==='sources'&&next.links.some(l=>l.evidence_type==='source'&&l.evidence_key===id)){reject('source_has_links',loc);continue;}
   if(table==='persons')next.externalAccounts=(next.externalAccounts||[]).filter(a=>a.person_id!==id);
   if(delta.purge)next.history=next.history.filter(h=>h.entity_type!==table||h.entity_id!==id);
   next[table]=next[table].filter(r=>r[key]!==id);
   const removedLinks=new Set(next.links.filter(l=>l.target_type===targetType&&l.target_id===id).map(l=>l.link_id));
   next.links=next.links.filter(l=>!removedLinks.has(l.link_id));
   if(delta.purge)next.history=next.history.filter(h=>h.entity_type!=='links'||!removedLinks.has(h.entity_id));
   next.history.push({change_id:`DELTA-${delta.run_id}-${id}`,entity_type:table,entity_id:id,before:delta.purge?null:structuredClone(original),after:null,actor_id:'system',reason:delta.purge?'purge':'remove non-work record',run_id:delta.run_id,result:'applied',applied_at:delta.collected_at});
   result.removed++;
  }
 }
 for (const [i,r] of (delta.history_purges||[]).entries()) {
  if (next[r.entity_type].some(x=>x[KEYS[r.entity_type]]===r.entity_id)) {reject('entity_still_exists',`history_purges[${i}]`);continue;}
  const before=next.history.length;next.history=next.history.filter(h=>h.entity_type!==r.entity_type||h.entity_id!==r.entity_id);
  result.removed+=before-next.history.length;
 }
 const ids = Object.fromEntries(Object.entries(KEYS).map(([k,key])=>[k,new Set(next[k].map(r=>r[key]))]));
 const taskIndex = new Map(next.tasks.map(t=>[t.task_id,t]));
 for (const t of next.tasks) {
  if (t.merged_into !== undefined && t.merged_into !== null) {
   const target=taskIndex.get(t.merged_into);
   if (typeof t.merged_into!=='string' || !target) reject('missing_merge_target','tasks');
   else if (target===t || target.merged_into != null || target.project_id!==t.project_id) reject('invalid_merge_target','tasks');
  }
  if (!['in_progress','completion_proposed','completed'].includes(t.status)) reject('invalid_task_status','tasks');
  if (!ids.projects.has(t.project_id)) reject('missing_project','tasks');
  if (t.assignee_id && t.assignee_id!=='unknown' && !ids.persons.has(t.assignee_id)) reject('missing_assignee','tasks');
 }
 // Existing historical logs may remain; only newly attached logs must target active tasks.
 const existingLogs = new Map((dataset.worklogs||[]).map(w=>[w.worklog_id,w]));
 for (const [i,w] of (delta.worklogs||[]).entries()) {
  if (!existingLogs.has(w.worklog_id) && taskIndex.get(next.worklogs.find(row=>row.worklog_id===w.worklog_id)?.task_id)?.merged_into != null) reject('merged_task_worklog',`worklogs[${i}]`);
 }
 for (const [i,w] of (delta.worklog_updates||[]).entries()) {
  if (existingLogs.get(w.worklog_id)?.task_id!==w.task_id && taskIndex.get(next.worklogs.find(row=>row.worklog_id===w.worklog_id)?.task_id)?.merged_into != null) reject('merged_task_worklog',`worklog_updates[${i}]`);
 }
 for (const w of next.worklogs) {
  if (!['exact','date','unknown'].includes(w.performed_at_precision) || (w.performed_at_precision==='exact'&&!iso(w.performed_at)) || (w.performed_at_precision==='date' && (typeof w.performed_at!=='string'||!/^\d{4}-\d{2}-\d{2}/.test(w.performed_at)))) reject('invalid_worklog_time','worklogs');
  if (!ids.tasks.has(w.task_id)) reject('missing_task','worklogs');
  if (w.performer_id!=='unknown' && !ids.persons.has(w.performer_id)) reject('missing_performer','worklogs');
 }
 for (const l of next.links) {
  if (typeof l.status!=='string' || !l.status) reject('missing_link_status','links');
  const target = {task:ids.tasks,worklog:ids.worklogs}[l.target_type];
  const evidence = {source:ids.sources,event:new Set((next.sourceEvents||[]).map(e=>e.event_key))}[l.evidence_type];
  if (!target?.has(l.target_id) || !evidence?.has(l.evidence_key)) reject('missing_link_reference','links');
 }
 const excluded=state.excluded||{};
 const blocked=(table,row,seen=new Set())=>{
  if(!row)return false;const token=table+':'+row[KEYS[table]];if(seen.has(token))return false;seen.add(token);
  if((excluded.projects||[]).includes(row.project_id)||(excluded.persons||[]).some(id=>[row.person_id,row.assignee_id,row.performer_id,row.owner_id,row.deputy_id].includes(id)))return true;
  if(table==='sources'&&(excluded.chat_spaces||[]).some(space=>{const id=space.split('spaces/').pop();return id&&[row.source_key,row.uri].some(v=>typeof v==='string'&&v.includes(id));}))return true;
  if(row.task_id&&table!=='tasks'&&blocked('tasks',next.tasks.find(t=>t.task_id===row.task_id),seen))return true;
  if(table==='links'){
   const type={task:'tasks',worklog:'worklogs'}[row.target_type];
   if(type&&blocked(type,next[type].find(r=>r[KEYS[type]]===row.target_id),seen))return true;
   if(row.evidence_type==='source'&&blocked('sources',next.sources.find(r=>r.source_key===row.evidence_key),seen))return true;
  }return false;
 };
 for(const [table,key] of Object.entries(KEYS)){
  const updates={tasks:'task_updates',persons:'person_updates',projects:'project_updates',worklogs:'worklog_updates'}[table];
  for(const row of [...(delta[table]||[]),...(delta[updates]||[])])if(blocked(table,next[table].find(r=>r[key]===row[key])))reject('excluded_reference',table);
 }
 if(errors.length)return fail();
 const date = new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Seoul'}).format(new Date(delta.collected_at));
 next.demoAsOf=date;
 next.demoNotice=/마지막 수집 \d{4}-\d{2}-\d{2}/.test(next.demoNotice||'') ? next.demoNotice.replace(/마지막 수집 \d{4}-\d{2}-\d{2}/g,`마지막 수집 ${date}`) : `${next.demoNotice||''} 마지막 수집 ${date}`.trim();
 (next.runs ||= []).push({run_id:delta.run_id,state:'complete',trigger:'scheduled-collect',manifest:[],recoveries:0});
 return {...result,ok:true,dataset:next,state:{...state,checkpoints:{...state.checkpoints,...delta.checkpoints},applied_runs:{...state.applied_runs,[delta.run_id]:inputDigest}}};
}


module.exports={merge,canonical,counts};
