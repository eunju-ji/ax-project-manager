const {setTimeout:wait}=require('node:timers/promises');
const {digest,uuid7,canTransition}=require('../domain/rules.cjs');
const {WORKSPACE:ws,row,add,content,hydrate,snapshot}=require('../repo/sqlite/records.cjs');
const {adapt}=require('../../src/adapter.js');
class Conflict extends Error{constructor(message){super(message);this.code='conflict';}}
const busy=e=>e.errcode===5||e.errcode===6||/database is locked|database is busy/.test(e.message);
class Service{
 constructor(db){this.db=db;this.fault=null;}
 checkpoint(stage){if(this.fault===stage)throw Error('injected '+stage);}
 async execute(request,operation){
  const hash=digest(request);let error;
  for(let attempt=0;attempt<3;attempt++){
   try{return this.db.tx(tx=>{
    const prior=row(tx,'requests',request.change_id);
    if(prior){if(prior.payload_digest!==hash)throw new Conflict('rejected_payload');return JSON.parse(prior.result);}
    const result=operation(tx);this.checkpoint('request');
    add(tx,'requests',request.change_id,{request_id:request.change_id,payload_digest:hash,result:JSON.stringify(result)});return result;
   });}catch(e){error=e;if(!busy(e))break;if(attempt<2)await wait(10*(attempt+1));}
  }
  // A rolled-back transaction cannot retain its own failure audit.
  for(let attempt=0;attempt<3;attempt++)try{this.db.tx(tx=>add(tx,'request_attempts',uuid7(),{request_id:request.change_id,payload_digest:hash,result:busy(error)?'busy_exhausted':error.code||'failed',applied_at:new Date().toISOString()}));break;}catch(e){if(!busy(e)||attempt===2){error.auditError=e.message;break;}await wait(10*(attempt+1));}
  if(error.auditError){require('./audit-spool.cjs').enqueue(this.db,{key:uuid7(),values:{request_id:request.change_id,payload_digest:hash,result:busy(error)?'busy_exhausted':error.code||'failed',applied_at:new Date().toISOString()}});}
  throw error;
 }
 audit(tx,entity,id,request,actor,reason,before,after){this.checkpoint('audit');add(tx,'change_log',uuid7(),{entity,entity_id:id,actor_id:actor,reason,request_id:request.change_id,applied_at:new Date().toISOString(),result:'applied',content_id:content(tx,{before,after})});}
 change(tx,table,r,values,request,actor,reason){this.checkpoint(table);const cols=Object.keys(values);const result=tx.run(`UPDATE ${table} SET ${cols.map(c=>c+'=?').join(',')},version=version+1 WHERE workspace_id=? AND id=? AND version=?`,...cols.map(c=>values[c]),ws,r.id,r.version);if(result.changes!==1)throw new Conflict('version conflict');this.audit(tx,table,r.id,request,actor,reason,{version:r.version},{...values,version:r.version+1});}
 transition(tx,t,p,input){
  if(t.version!==input.expected_version)throw new Conflict('task version');
  const td=hydrate(tx,t),pd=hydrate(tx,p);
  if(input.project_version!==undefined&&p.version!==input.project_version)throw new Conflict('project role changed');
  if(!canTransition(td,pd,input.actor_id,input.to,input.reason))throw new Conflict('transition forbidden');
  this.change(tx,'tasks',t,{status:input.to},input,input.actor_id,'task transition');
  if(input.to==='in_progress')for(const r of tx.all("SELECT * FROM reviews WHERE workspace_id=? AND task_id=? AND kind='completion' AND status='open'",ws,t.id))this.change(tx,'reviews',r,{status:'superseded'},input,input.actor_id,'stale completion proposal');
 }
 move(input){return this.execute(input,tx=>{const t=row(tx,'tasks',input.task_id);if(!t)throw new Conflict('task missing');const p=row(tx,'projects',t.project_id);this.transition(tx,t,p,input);return {change_id:input.change_id,state:'complete'};});}
 decide(input){return this.execute(input,tx=>{
  const r=row(tx,'reviews',input.review_id);if(!r||r.kind!=='completion'||r.status==='superseded')throw new Conflict('invalid review');
  const rd=hydrate(tx,r);if(r.status==='decided'){if(r.decision!==input.answer)throw new Conflict('review already decided');return {change_id:rd.applied_change_id,state:'complete'};}
  const t=row(tx,'tasks',r.task_id),p=row(tx,'projects',t.project_id);const actor=input.actor_id||hydrate(tx,t).assignee_id;
  if(t.version!==input.expected_version)throw new Conflict('task version');
  if(input.answer==='완료')this.transition(tx,t,p,{...input,actor_id:actor,to:'completed',reason:'Review completion'});
  else if(input.answer==='진행 중'){
   if(hydrate(tx,t).assignee_id!==actor)throw new Conflict('review actor');
  }else throw new Conflict('invalid answer');
  this.change(tx,'reviews',r,{status:'decided',decision:input.answer,metadata:JSON.stringify({...JSON.parse(r.metadata),applied_change_id:input.change_id})},input,actor,'completion judgment');
  return {change_id:input.change_id,state:'complete'};
 });}
 deputy(input){return this.execute(input,tx=>{const p=row(tx,'projects',input.project_id);if(!p||hydrate(tx,p).owner_id!==input.actor_id||p.version!==input.expected_version)throw new Conflict('project role/version');const d=input.deputy_id?row(tx,'persons',input.deputy_id):null;if(input.deputy_id&&!d)throw new Conflict('person missing');this.change(tx,'projects',p,{deputy_id:d?.id||null,metadata:JSON.stringify({...JSON.parse(p.metadata),deputy_id:input.deputy_id||null})},input,input.actor_id,'deputy assignment');return {state:'complete'};});}
 worklog(input){return this.execute(input,tx=>{const t=row(tx,'tasks',input.task_id),p=t&&row(tx,'projects',t.project_id);if(!t||![hydrate(tx,t).assignee_id,hydrate(tx,p).owner_id,hydrate(tx,p).deputy_id].includes(input.actor_id))throw new Conflict('worklog actor');const old=row(tx,'worklogs',input.worklog_id);if((old?.version||0)!==input.expected_version)throw new Conflict('worklog version');const performer=input.performer_id?row(tx,'persons',input.performer_id):null;if(input.performer_id&&!performer)throw new Conflict('performer missing');const values={task_id:t.id,performer_person_id:performer?.id||null,performer_state:performer?'known':'unknown',performed_at_precision:input.precision,performed_at:input.precision==='exact'?new Date(input.performed_at).toISOString():null,performed_on:input.precision==='date'?input.performed_on:null,content_id:content(tx,{title:input.title,summary:input.summary})};let id;if(old){this.change(tx,'worklogs',old,values,input,input.actor_id,'worklog correction');id=old.id;}else{id=add(tx,'worklogs',input.worklog_id,values,{worklog_id:input.worklog_id,task_id:input.task_id,performer_id:input.performer_id||'unknown',performed_at_precision:input.precision,performed_at:input.performed_at||input.performed_on||null});this.audit(tx,'worklogs',id,input,input.actor_id,'worklog created',null,{id});}if(input.source_key){const source=row(tx,'sources',input.source_key);if(!source)throw new Conflict('source missing');const link=add(tx,'links',uuid7(),{task_id:null,worklog_id:id,source_id:source.id,source_event_id:null,status:'confirmed'},{target_type:'worklog',target_id:input.worklog_id,evidence_type:'source',evidence_key:input.source_key});this.audit(tx,'links',link,input,input.actor_id,'worklog evidence',null,{id:link});}return {state:'complete',worklog_id:input.worklog_id};});}
 availability(input){return this.execute(input,tx=>{if(input.actor_id!=='system'||!['available','access_denied','moved','deleted','unknown'].includes(input.availability))throw new Conflict('availability');const source=row(tx,'sources',input.source_key);if(!source||source.version!==input.expected_version)throw new Conflict('source version');this.change(tx,'sources',source,{availability:input.availability,checked_at:new Date().toISOString()},input,'system','source availability');return {state:'complete'};});}
 metrics(kind,from='2026-11-01T00:00:00.000Z',until='2026-11-08T00:00:00.000Z'){return this.db.tx(tx=>{if(kind==='projects')return tx.all('SELECT display_key,owner_id,version FROM projects WHERE workspace_id=? ORDER BY display_key,id',ws);if(kind==='reviews')return tx.all("SELECT id,task_id,kind FROM reviews WHERE workspace_id=? AND status='open' ORDER BY id",ws);if(kind==='weekly')return tx.all('SELECT performer_person_id,count(*) count FROM worklogs WHERE workspace_id=? AND performed_at>=? AND performed_at<? GROUP BY performer_person_id ORDER BY performer_person_id NULLS LAST',ws,from,until);throw new Conflict('query kind');});}
 view(){return this.db.tx(tx=>{
  const data=snapshot(tx);data.demoAsOf='2026-11-17';
  data.tasks=data.tasks.filter(t=>!t.merged_into&&!t.split_into);
  const visible=r=>[r.run_id,r.created_run_id].filter(Boolean).every(id=>data.runs.find(r=>r.run_id===id)?.state==='complete');
  for(const k of Object.keys(data))if(Array.isArray(data[k])&&k!=='runs')data[k]=data[k].filter(visible);
  const driveSources=new Map(data.sources.filter(s=>s.service==='drive').map(s=>[s.file_id,{availability:s.availability,file:s.retained_meta}]));
  data.sources=data.sources.map(s=>s.service==='drive'&&(s.availability!=='available'||require('../connectors/drive/visibility.cjs').hiddenAncestor(s.retained_meta,driveSources,s.account_scope))?{...s,title:'',retained_meta:undefined}:s);
  const visibility=require('../connectors/drive/visibility.cjs');
  data.sources=data.sources.map(s=>s.retained_meta?{...s,retained_meta:{...s.retained_meta,folderPath:visibility.currentPath(s.retained_meta,driveSources,s.account_scope)}}:s);
  data.reviews=data.reviews.map(r=>{const e=data.sourceEvents.find(e=>e.event_key===r.event_key),source=data.sources.find(s=>s.source_key===(r.source_key||e?.source_key));if(source?.service!=='drive'&&!r.pilot)return r;return visibility.presentReview(r,source?{...source,file:driveSources.get(source.file_id)?.file}:null,driveSources,source?.account_scope);});
  const view=adapt({...data,reviews:data.reviews.map(r=>r.status==='decided'?{...r,status:'open'}:r)});
  add(tx,'access_audit',uuid7(),{actor_id:'local-synthetic',action:'view',applied_at:new Date().toISOString()});
  return {...view,decisions:data.reviews.filter(r=>r.status==='decided'),taskStates:data.tasks.map(t=>({id:t.task_id,status:t.status,version:t.version}))};
 });}
 purge(input){return this.execute(input,tx=>{if(input.actor_id!=='local-admin')throw new Conflict('purge role');const c=row(tx,'protected_contents',input.content_id);if(!c)throw new Conflict('content missing');this.change(tx,'protected_contents',c,{value:null,purged_at:new Date().toISOString()},input,input.actor_id,'protected content purge');return {state:'complete'};});}
}
module.exports={Service,Conflict,busy};
