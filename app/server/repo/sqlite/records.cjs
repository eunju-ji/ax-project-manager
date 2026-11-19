const {uuid7,digest}=require('../../domain/rules.cjs');
const WORKSPACE='01900000-0000-7000-8000-000000000001';
const tables={persons:'person_id',projects:'project_id',tasks:'task_id',runs:'run_id',sources:'source_key',source_events:'event_key',worklogs:'worklog_id',links:'link_id',reviews:'review_id',suppressions:'suppression_id'};
const aliases={source_events:'sourceEvents'};
function insert(tx,table,row){if(['tasks','projects'].includes(table))require('../../domain/display-key.cjs').assertKey(row.display_key);const cols=Object.keys(row);return tx.run(`INSERT INTO ${table} (${cols.join(',')}) VALUES (${cols.map(()=>'?').join(',')})`,...cols.map(c=>row[c]));}
function row(tx,table,key,ws=WORKSPACE){return tx.get(`SELECT * FROM ${table} WHERE workspace_id=? AND (display_key=? OR id=?)`,ws,key,key);}
function add(tx,table,key,values={},metadata={},ws=WORKSPACE){const id=uuid7();insert(tx,table,{workspace_id:ws,id,display_key:key,...values,metadata:JSON.stringify(metadata)});return id;}
const protectedFields=['title','summary','name','purpose','display_name','proposal','text','before','after','completion_criteria','decision','weekly_summary','artifact','reason','performer_basis'];
function content(tx,value,ws=WORKSPACE){return add(tx,'protected_contents',uuid7(),{kind:'metadata',value:JSON.stringify(value)}, {},ws);}
function hydrate(tx,r){const meta=JSON.parse(r.metadata),c=r.content_id&&row(tx,'protected_contents',r.content_id,r.workspace_id);const extra={};if('availability' in r)extra.availability=r.availability;if('performer_state' in r){extra.performer_id=r.performer_person_id?row(tx,'persons',r.performer_person_id,r.workspace_id).display_key:'unknown';extra.performed_at_precision=r.performed_at_precision;extra.performed_at=r.performed_at||r.performed_on;}if('processed_count' in r)extra.state=r.status==='succeeded'?'complete':r.status==='running'?'incomplete':r.status;return {...meta,...(c?.value?JSON.parse(c.value):{}),...extra,version:r.version,...(r.status!==undefined?{status:r.status}:{}),...(r.decision!==undefined&&r.decision!==null?{decision:r.decision}:{})};}
function seed(db,data){db.tx(tx=>{
 if(tx.get('SELECT 1 FROM workspaces WHERE id=?',WORKSPACE))return;
 insert(tx,'workspaces',{workspace_id:WORKSPACE,id:WORKSPACE,display_key:'local'});
 const id=(t,k)=>k&&k!=='unknown'?row(tx,t,k)?.id||null:null;
 for(const [table,key]of Object.entries(tables))for(const original of data[aliases[table]||table]||[]){
  const r={...original},p={};for(const f of protectedFields)if(f in r){p[f]=r[f];delete r[f];}
  delete r.basis_links;delete r.actor_external_ids;delete r.external_ids;
  const v={version:original.version||1};
  if(['persons','projects','tasks','sources','source_events','worklogs','reviews'].includes(table))v.content_id=content(tx,p);
  if(table==='projects')Object.assign(v,{owner_id:id('persons',r.owner_id),deputy_id:id('persons',r.deputy_id)});
  if(table==='tasks')Object.assign(v,{project_id:id('projects',r.project_id),assignee_id:id('persons',r.assignee_id),status:r.status,category:r.category||''});
  if(table==='runs')v.status=r.state==='complete'?'succeeded':r.state==='failed'?'failed':'running';
  if(table==='sources')Object.assign(v,{availability:r.availability||'unknown',checked_at:r.availability_checked_at||null});
  if(table==='source_events')Object.assign(v,{source_id:id('sources',r.source_key),event_key:r.event_key,payload_digest:r.normalized_payload_digest||digest(original),key_version:r.key_version||1,occurred_at:r.occurred_at?new Date(r.occurred_at).toISOString():null,collected_at:new Date().toISOString()});
  if(table==='worklogs')Object.assign(v,{task_id:id('tasks',r.task_id),performer_person_id:id('persons',r.performer_id),performer_state:id('persons',r.performer_id)?'known':'unknown',performed_at_precision:r.performed_at_precision,performed_at:r.performed_at_precision==='exact'?new Date(r.performed_at).toISOString():null,performed_on:r.performed_at_precision==='date'?r.performed_at.slice(0,10):null});
  if(['links','suppressions'].includes(table))Object.assign(v,{task_id:r.target_type==='task'?id('tasks',r.target_id):null,worklog_id:r.target_type==='worklog'?id('worklogs',r.target_id):null,source_id:r.evidence_type==='source'?id('sources',r.evidence_key):null,source_event_id:r.evidence_type==='event'?id('source_events',r.evidence_key):null},table==='links'?{status:r.status}:{scope:r.scope,released_at:r.released_at||null});
  if(table==='reviews')Object.assign(v,{task_id:id('tasks',r.subject_id),kind:r.kind,status:r.status,decision:null});
  add(tx,table,original[key],v,r);
 }
 for(const r of data.externalAccounts||[])add(tx,'external_accounts',`${r.service}:${r.account_scope}:${r.external_id}`,{service:r.service,account_scope:r.account_scope,external_id:r.external_id,person_id:id('persons',r.person_id),is_bot:r.kind==='bot'?1:0});
 for(const e of data.sourceEvents||[])for(const actor of e.actor_external_ids||[]){let a=tx.get('SELECT * FROM external_accounts WHERE workspace_id=? AND external_id=?',WORKSPACE,actor);if(!a){const aid=add(tx,'external_accounts',actor,{service:'synthetic',account_scope:'local',external_id:actor,person_id:null,is_bot:0});a={id:aid};}add(tx,'source_event_actors',uuid7(),{source_event_id:id('source_events',e.event_key),external_account_id:a.id});}
 for(const p of data.projects||[])for(const scope of p.approved_scopes||[]){let c=row(tx,'connectors',scope);if(!c){const [service,account_scope]=scope.split(':');c={id:add(tx,'connectors',scope,{service,account_scope,stream:'synthetic'})};}add(tx,'project_collection_scopes',uuid7(),{project_id:id('projects',p.project_id),connector_id:c.id,scope});}
 for(const e of data.eventConflicts||[])add(tx,'source_event_variants',uuid7(),{event_key:e.event_key,payload_digest:e.normalized_payload_digest,source_event_id:id('source_events',e.event_key),content_id:content(tx,e)});
 for(const h of data.history||[])add(tx,'change_log',h.change_id,{entity:h.entity_type,entity_id:h.entity_id,actor_id:h.actor_id||'system',reason:'synthetic seed',request_id:h.change_id,applied_at:h.applied_at,result:h.result,content_id:content(tx,h)});
 });}
function snapshot(tx){const result={};for(const t of Object.keys(tables))result[aliases[t]||t]=tx.all(`SELECT * FROM ${t} WHERE workspace_id=? ORDER BY display_key,id`,WORKSPACE).map(r=>hydrate(tx,r));return result;}
module.exports={WORKSPACE,tables,insert,row,add,content,hydrate,seed,snapshot};
