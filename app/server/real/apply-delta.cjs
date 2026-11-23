const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { isDeepStrictEqual: equal } = require('node:util');

const DEFAULT_DATASET = path.join(__dirname, '../.real/real-dataset.json');
const KEYS = { persons:'person_id', projects:'project_id', tasks:'task_id', worklogs:'worklog_id', sources:'source_key', links:'link_id' };
const UPDATE_FIELDS = new Set(['description','status','completed_at','completion_basis','due_date','due_basis','title','summary','category','assignee_id','project_id','wbs_code','start_date','plan_source','plan_ref']);
const SECRET = /AIza[0-9A-Za-z_-]{20,}|token=[A-Za-z0-9_-]{10,}|SMTP_PASSWORD=|KEY_JSON=|-----BEGIN/;
const object = v => v !== null && typeof v === 'object' && !Array.isArray(v);
const iso = v => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/.test(v) && Number.isFinite(Date.parse(v));
function canonical(v) {
 if (Array.isArray(v)) return v.map(canonical);
 if (object(v)) return Object.fromEntries(Object.keys(v).sort().map(k => [k,canonical(v[k])]));
 return v;
}
const digest = v => crypto.createHash('sha256').update(JSON.stringify(canonical(v))).digest('hex');
const dateOnly = v => typeof v==='string' && /^\d{4}-\d{2}-\d{2}$/.test(v) && Number.isFinite(Date.parse(v)) && new Date(v).toISOString().slice(0,10)===v;
const validDescription = row => !('description' in row) || row.description === null || (typeof row.description === 'string' && [...row.description].length <= 200);
function validPlan(row, nullable=false) {
 return ['wbs_code','start_date','due_date','plan_source','plan_ref'].every(k=>{
  if (!(k in row)) return true;
  const v=row[k];if(v===null)return nullable;
  if(k==='start_date'||k==='due_date')return dateOnly(v);
  if(k==='plan_source')return ['wbs','activity'].includes(v);
  return typeof v==='string' && (k!=='wbs_code'||[...v].length<=16);
 });
}
function humanChanged(dataset,type,id,field) {
 return (dataset.history||[]).some(h=>h.entity_type===type&&h.entity_id===id&&h.actor_id!=='system'&&!equal(h.before?.[field],h.after?.[field]));
}
const counts = d => Object.keys(KEYS).reduce((n,k)=>n+(d[k]?.length||0),0)+(d.task_updates?.length||0)+(d.worklog_updates?.length||0);

// No input values in errors: rejected input may itself contain credentials.
function merge(dataset, state, delta) {
 const errors = [];
 const reject = (code, location) => errors.push({code,location});
 const result = {ok:false,added:0,updated:0,ignored:0,rejected:0,errors};
 const fail = () => ({...result,added:0,updated:0,rejected:errors.length});
 if (!object(delta)) { reject('object_required','delta'); return fail(); }
 if (typeof delta.run_id !== 'string' || !/^[A-Za-z0-9_-]{1,64}$/.test(delta.run_id)) reject('invalid_run_id','run_id');
 if (!iso(delta.collected_at)) reject('invalid_iso','collected_at');
 const allowed = new Set(['run_id','collected_at','checkpoints',...Object.keys(KEYS),'task_updates','worklog_updates','notes']);
 for (const k of Object.keys(delta)) if (!allowed.has(k)) reject('unknown_field','delta');
 if (SECRET.test(JSON.stringify(delta))) reject('secret_pattern','delta');
 for (const k of [...Object.keys(KEYS),'task_updates','worklog_updates']) if (delta[k] !== undefined && (!Array.isArray(delta[k]) || delta[k].some(r=>!object(r)))) reject('record_array_required',k);
 if (delta.checkpoints !== undefined && !object(delta.checkpoints)) reject('object_required','checkpoints');
 for (const [k,v] of Object.entries(object(delta.checkpoints)?delta.checkpoints:{})) {
  if (!['drive','chat','gmail'].includes(k) || !iso(v)) reject('invalid_checkpoint','checkpoints');
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
 const stamp = r => ({...r,run_id:delta.run_id,created_run_id:delta.run_id});
 for (const [table,key] of Object.entries(KEYS)) {
  next[table] ||= [];
  const index = new Map(next[table].map(r=>[r[key],r]));
  for (const [i,row] of (delta[table]||[]).entries()) {
   const loc = `${table}[${i}]`;
   if (typeof row[key] !== 'string' || !row[key].length) { reject('missing_key',loc); continue; }
   if (['projects','tasks'].includes(table) && !/^[A-Za-z0-9_-]{1,64}$/.test(row[key])) reject('invalid_key',loc);
   if (table==='tasks' && !validDescription(row)) reject('description_limit',loc);
   if (table==='tasks' && !validPlan(row)) reject('invalid_plan_field',loc);
   if (table==='worklogs' && (typeof row.summary!=='string' || [...row.summary].length>160)) reject('summary_limit',loc);
   if (table==='sources') {
    if (typeof row.title!=='string' || [...row.title].length>200) reject('title_limit',loc);
    if (typeof row.kind!=='string' || (row.kind!=='message' && (!Array.isArray(row.folder_path) || row.folder_path.some(p=>typeof p!=='string')))) reject('folder_path_required',loc);
   }
   // Bodies are never part of the digest dataset contract.
   if (['body','raw','raw_body','content','message_body','html_body'].some(k=>k in row)) reject('raw_content_forbidden',loc);
   const existing = index.get(row[key]);
   if (existing) {
    const strip = r => Object.fromEntries(Object.entries(r).filter(([k])=>!['run_id','created_run_id'].includes(k)));
    if (equal(strip(existing),strip(row))) result.ignored++;
    else reject('record_conflict',loc);
   } else { const added=stamp(row); next[table].push(added);index.set(row[key],added);result.added++; }
  }
 }
 next.history ||= [];
 const seenUpdates = new Set();
 for (const [i,update] of (delta.task_updates||[]).entries()) {
  const loc = `task_updates[${i}]`;
  const task = next.tasks.find(t=>t.task_id===update.task_id);
  if (!task || seenUpdates.has(update.task_id)) { reject('missing_or_duplicate_task',loc); continue; }
  seenUpdates.add(update.task_id);
  const fields = Object.keys(update).filter(k=>k!=='task_id');
  if (fields.some(k=>!UPDATE_FIELDS.has(k))) { reject('invalid_update_field',loc); continue; }
  if (fields.some(k=>update[k]!==null && typeof update[k]!=='string')) { reject('invalid_update_value',loc); continue; }
  if (!validDescription(update)) { reject('description_limit',loc); continue; }
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
  if(humanChanged(dataset,'worklogs',update.worklog_id,'task_id')){reject('human_correction_protected',loc);continue;}
  const target=next.worklogs.find(w=>w.worklog_id===update.worklog_id);
  const before={task_id:target.task_id};target.task_id=update.task_id;
  next.history.push({change_id:`DELTA-${delta.run_id}-${update.worklog_id}`,entity_type:'worklogs',entity_id:update.worklog_id,before,after:{task_id:target.task_id},actor_id:'system',reason:'scheduled-collect worklog update',run_id:delta.run_id,result:'applied',applied_at:delta.collected_at});
  result.updated++;
 }
 const ids = Object.fromEntries(Object.entries(KEYS).map(([k,key])=>[k,new Set(next[k].map(r=>r[key]))]));
 for (const t of next.tasks) {
  if (!['in_progress','completion_proposed','completed'].includes(t.status)) reject('invalid_task_status','tasks');
  if (!ids.projects.has(t.project_id)) reject('missing_project','tasks');
  if (t.assignee_id && t.assignee_id!=='unknown' && !ids.persons.has(t.assignee_id)) reject('missing_assignee','tasks');
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
 if (errors.length) return fail();
 const date = new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Seoul'}).format(new Date(delta.collected_at));
 next.demoAsOf=date;
 next.demoNotice=/마지막 수집 \d{4}-\d{2}-\d{2}/.test(next.demoNotice||'') ? next.demoNotice.replace(/마지막 수집 \d{4}-\d{2}-\d{2}/g,`마지막 수집 ${date}`) : `${next.demoNotice||''} 마지막 수집 ${date}`.trim();
 (next.runs ||= []).push({run_id:delta.run_id,state:'complete',trigger:'scheduled-collect',manifest:[],recoveries:0});
 return {...result,ok:true,dataset:next,state:{...state,checkpoints:{...state.checkpoints,...delta.checkpoints},applied_runs:{...state.applied_runs,[delta.run_id]:inputDigest}}};
}

// Stage all bytes first, rename dataset last; restore already-replaced files on I/O error.
function replaceFiles(entries) {
 const suffix = `.tmp-${process.pid}-${crypto.randomUUID()}`;
 const staged = [], replaced = [];
 try {
  for (const [file,bytes] of entries) {
   const original=fs.existsSync(file)?fs.readFileSync(file):null;
   const temp=file+suffix;
   staged.push({file,temp,original});fs.writeFileSync(temp,bytes,{flag:'wx',mode:0o600});
  }
  for (const s of staged) { fs.renameSync(s.temp,s.file); replaced.push(s); }
 } catch (error) {
  for (const s of replaced.reverse()) {
   if (s.original===null) fs.unlinkSync(s.file);
   else {fs.writeFileSync(s.temp,s.original,{mode:0o600});fs.renameSync(s.temp,s.file);}
  }
  throw error;
 } finally { for (const s of staged) if(fs.existsSync(s.temp)) fs.unlinkSync(s.temp); }
}
function applyDelta(delta, {dataset=DEFAULT_DATASET,dryRun=false}={}) {
 const dir=path.dirname(path.resolve(dataset));
 const stateFile=path.join(dir,'state.json'), logFile=path.join(dir,'runs.log'), lock=path.join(dir,'apply-delta.lock');
 let owned=false;
 const failure=code=>({ok:false,added:0,updated:0,ignored:0,rejected:1,errors:[{code,location:'filesystem'}]});
 try {
  if (fs.existsSync(lock)) {
   if (Date.now()-fs.statSync(lock).mtimeMs<=30*60*1000 || dryRun) return failure('locked');
   fs.unlinkSync(lock);
  }
  if (!dryRun) { const fd=fs.openSync(lock,'wx',0o600);owned=true;try{fs.writeFileSync(fd,JSON.stringify({pid:process.pid}));}finally{fs.closeSync(fd);} }
  const original=JSON.parse(fs.readFileSync(dataset,'utf8'));
  const state=fs.existsSync(stateFile)?JSON.parse(fs.readFileSync(stateFile,'utf8')):{};
  const merged=merge(original,state,delta);
  const {dataset:next,state:nextState,replay,...summary}=merged;
  const audit={...summary,run_id:typeof delta?.run_id==='string'&&/^[A-Za-z0-9_-]{1,64}$/.test(delta.run_id)?delta.run_id:null,processed_at:new Date().toISOString(),dry_run:dryRun};
  if (!dryRun) {
   const log=(fs.existsSync(logFile)?fs.readFileSync(logFile,'utf8'):'')+JSON.stringify(audit)+'\n';
   const entries=[[logFile,log]];
   if (merged.ok && !replay) entries.push([stateFile,JSON.stringify(nextState,null,2)+'\n'],[dataset,JSON.stringify(next,null,2)+'\n']);
   replaceFiles(entries);
  }
  return audit;
 } catch (error) { return failure(error.code==='EEXIST'?'locked':'io_or_invalid_json'); }
 finally { if(owned) fs.unlinkSync(lock); }
}
function main(args) {
 let file, dataset=DEFAULT_DATASET, dryRun=false;
 for(let i=0;i<args.length;i++) {
  if(args[i]==='--dry-run') dryRun=true;
  else if(args[i]==='--dataset' && args[i+1]) dataset=args[++i];
  else if(!file && !args[i].startsWith('--')) file=args[i];
  else throw Error('usage');
 }
 if(!file) throw Error('usage');
 const result=applyDelta(JSON.parse(fs.readFileSync(file,'utf8')),{dataset,dryRun});
 console.log(JSON.stringify(result));if(!result.ok)process.exitCode=1;
}
if(require.main===module) {try{main(process.argv.slice(2));}catch{console.log(JSON.stringify({ok:false,errors:[{code:'invalid_input_or_arguments'}]}));process.exitCode=1;}}
module.exports={applyDelta,merge,DEFAULT_DATASET};
