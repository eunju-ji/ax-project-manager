const {Service,Conflict}=require('./index.cjs');
const {normalize}=require('../domain/normalize.cjs');const {uuid7}=require('../domain/rules.cjs');
const {WORKSPACE:ws,row,add,content,hydrate}=require('../repo/sqlite/records.cjs');
// All page fetches/LLM calls belong to caller, before page(). Only normalized synthetic input here.
class Collector extends Service{
 page(input){const events=input.events.map(normalize);return this.execute(input,tx=>{
  const cursor=row(tx,'connector_cursors',input.connector_id),connector=row(tx,'connectors',input.connector_id);
  if(!connector)throw new Conflict('connector missing');
  if((cursor?.version||0)!==input.expected_version)throw new Conflict('cursor version');
  const run=row(tx,'runs',input.run_id);if(!run)throw new Conflict('run missing');
  this.preparePage?.(tx,input);
  for(const e of events){
   const alias=tx.get('SELECT * FROM event_key_aliases WHERE workspace_id=? AND old_key=? AND key_version=?',ws,e.event_key,e.key_version);
   const old=alias?row(tx,'source_events',alias.source_event_id):row(tx,'source_events',e.event_key);
   if(old){if(old.payload_digest!==e.normalized_payload_digest&&!tx.get('SELECT 1 FROM source_event_variants WHERE workspace_id=? AND event_key=? AND payload_digest=?',ws,old.event_key,e.normalized_payload_digest)){
    const variant=add(tx,'source_event_variants',uuid7(),{event_key:old.event_key,payload_digest:e.normalized_payload_digest,source_event_id:old.id,content_id:content(tx,e)});
    add(tx,'reviews',uuid7(),{task_id:null,kind:'conflict',status:'open',content_id:content(tx,{proposal:'event variant',variant_id:variant})});
   }continue;}
   const source=row(tx,'sources',e.source_key);if(!source)throw new Conflict('source missing');
   const {text,actor_external_ids,...meta}=e;
   const event=add(tx,'source_events',e.event_key,{event_key:e.event_key,payload_digest:e.normalized_payload_digest,key_version:e.key_version,source_id:source.id,occurred_at:e.occurred_at||null,collected_at:new Date().toISOString(),content_id:content(tx,{text:text||''})},meta);
   for(const external of actor_external_ids||[]){let a=tx.get('SELECT * FROM external_accounts WHERE workspace_id=? AND external_id=?',ws,external);if(!a)a={id:add(tx,'external_accounts',uuid7(),{service:e.service||'synthetic',account_scope:e.account_scope||'local',external_id:external,person_id:null,is_bot:0})};add(tx,'source_event_actors',uuid7(),{source_event_id:event,external_account_id:a.id});}
   add(tx,'processing_queue',uuid7(),{source_event_id:event,status:'pending'});
  }
  this.checkpoint('cursor');
  this.afterPage?.(tx,input,events);
  if(cursor)this.change(tx,'connector_cursors',cursor,{cursor:input.next_cursor},input,'system','collection cursor');else add(tx,'connector_cursors',input.connector_id,{connector_id:connector.id,cursor:input.next_cursor});
  this.change(tx,'runs',run,{processed_count:run.processed_count+events.length,status:input.done?'succeeded':'running'},input,'system','collection page');
  return {state:'complete',count:events.length};
 });}
 claim(input){return this.execute(input,tx=>{const q=row(tx,'processing_queue',input.queue_id);const now=new Date().toISOString();if(!q||q.status==='done'||(q.status==='processing'&&q.lease_until>now))throw new Conflict('queue owned');this.change(tx,'processing_queue',q,{status:'processing',worker_id:input.worker_id,lease_until:new Date(Date.now()+30000).toISOString(),attempts:q.attempts+1},input,'system','queue lease');return {state:'complete'};});}
 process(input){return this.execute(input,tx=>{const q=row(tx,'processing_queue',input.queue_id);if(!q||q.status!=='processing'||q.worker_id!==input.worker_id||q.lease_until<=new Date().toISOString())throw new Conflict('queue lease expired');const e=row(tx,'source_events',q.source_event_id);
  const event=hydrate(tx,e);for(const key of new Set((event.text||'').match(/(?:TSK-[a-zA-Z0-9-]+|[A-Z]+-\d+)/g)||[]))this.autoLink(tx,e,key,input);
  this.change(tx,'processing_queue',q,{status:'done',worker_id:null,lease_until:null},input,'system','queue complete');return {state:'complete'};});}
 autoLink(tx,e,key,input){const t=row(tx,'tasks',key);if(!t)return;const source=row(tx,'sources',e.source_id);const scope=source.display_key.split(':').slice(0,2).join(':');
  const allowed=tx.get('SELECT 1 FROM project_collection_scopes WHERE workspace_id=? AND project_id=? AND scope=?',ws,t.project_id,scope);
  const blocked=tx.get('SELECT 1 FROM suppressions WHERE workspace_id=? AND task_id=? AND released_at IS NULL AND (source_id=? OR source_event_id=?)',ws,t.id,e.source_id,e.id);
  if(!allowed||blocked){add(tx,'reviews',uuid7(),{task_id:t.id,kind:'conflict',status:'open',content_id:content(tx,{proposal:blocked?'suppressed':'scope'})});return;}
  if(!tx.get("SELECT 1 FROM links WHERE workspace_id=? AND task_id=? AND source_event_id=? AND status='confirmed'",ws,t.id,e.id)){
   const id=add(tx,'links',uuid7(),{task_id:t.id,worklog_id:null,source_id:null,source_event_id:e.id,status:'confirmed'},{target_type:'task',target_id:key,evidence_type:'event',evidence_key:e.display_key,status:'confirmed'});
   this.audit(tx,'links',id,input,'system','explicit task ID',null,{task_id:t.id,source_event_id:e.id});
  }
 }
 reject(input){return this.execute(input,tx=>{const l=row(tx,'links',input.link_id);if(!l)throw new Conflict('link missing');const task=l.task_id?row(tx,'tasks',l.task_id):row(tx,'tasks',row(tx,'worklogs',l.worklog_id).task_id);const p=row(tx,'projects',task.project_id);if(![hydrate(tx,task).assignee_id,hydrate(tx,p).owner_id,hydrate(tx,p).deputy_id].includes(input.actor_id))throw new Conflict('link actor');if(l.version!==input.expected_version)throw new Conflict('link version');
  const source=l.source_id||row(tx,'source_events',l.source_event_id).source_id;
  this.change(tx,'links',l,{status:'rejected'},input,input.actor_id,'link rejected');
  const existing=tx.get('SELECT * FROM suppressions WHERE workspace_id=? AND task_id IS ? AND worklog_id IS ? AND source_id IS ? AND source_event_id IS ? AND released_at IS NULL',ws,l.task_id,l.worklog_id,input.scope==='event'?null:source,input.scope==='event'?l.source_event_id:null);
  const id=existing?.id||add(tx,'suppressions',uuid7(),{scope:input.scope||'source',task_id:l.task_id,worklog_id:l.worklog_id,source_id:input.scope==='event'?null:source,source_event_id:input.scope==='event'?l.source_event_id:null});
  this.audit(tx,'suppressions',id,input,input.actor_id,'suppress rejected link',null,{scope:input.scope||'source'});return {state:'complete',suppression_id:id};
 });}
 release(input){return this.execute(input,tx=>{const s=row(tx,'suppressions',input.suppression_id);if(!s||s.version!==input.expected_version)throw new Conflict('suppression version');const task=s.task_id?row(tx,'tasks',s.task_id):row(tx,'tasks',row(tx,'worklogs',s.worklog_id).task_id),p=row(tx,'projects',task.project_id);if(![hydrate(tx,task).assignee_id,hydrate(tx,p).owner_id,hydrate(tx,p).deputy_id].includes(input.actor_id))throw new Conflict('suppression actor');this.change(tx,'suppressions',s,{released_at:new Date().toISOString()},input,input.actor_id,'suppression released');return {state:'complete'};});}
}
module.exports={Collector};
