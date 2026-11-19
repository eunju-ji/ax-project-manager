// Local-only human-edited reference data. No OAuth or HTTP dependency.
const {WORKSPACE:ws,row,add,content,hydrate}=require('../../repo/sqlite/records.cjs');
const {validKey}=require('../../domain/display-key.cjs');
const {uuid7}=require('../../domain/rules.cjs');
const COLUMNS=['kind','include','project_key','project_name','task_key','task_name','category','assignee_email','folder_path','folder_id','file_count','last_activity_at','active_people_count'];
const CATEGORIES=['기획·설계','조사·분석','제작·구현','검증','운영·지원'];
const FOLDER='application/vnd.google-apps.folder';
function sources(tx,driveId){return tx.all('SELECT * FROM sources WHERE workspace_id=?',ws).filter(s=>{const m=JSON.parse(s.metadata);return m.service==='drive'&&m.account_scope===driveId;}).map(s=>({...s,file:hydrate(tx,s).retained_meta||{}}));}
function ancestors(file,byId,driveId){const ids=[],seen=new Set();let id=file.id;while(id&&id!==driveId&&!seen.has(id)){ids.push(id);seen.add(id);id=byId.get(id)?.file.parents?.[0];}return ids;}
function draft(store){return store.db.tx(tx=>{
 const all=sources(tx,store.driveId),byId=new Map(all.map(s=>[s.file.id,s]));
 const events=tx.all('SELECT * FROM source_events WHERE workspace_id=?',ws),actors=tx.all('SELECT * FROM source_event_actors WHERE workspace_id=?',ws);
 const rows=[];
 for(const s of all){const f=s.file;if(s.availability!=='available')continue;
  const chain=ancestors(f,byId,store.driveId),root=chain.at(-1),top=byId.get(root)?.file;
  const isFolder=f.mimeType===FOLDER;
  if(!isFolder&&f.parents?.[0]!==store.driveId)continue;
  if(isFolder&&top?.parents?.[0]!==store.driveId)continue;
  const members=all.filter(x=>x.file.mimeType!==FOLDER&&ancestors(x.file,byId,store.driveId).includes(f.id));
  const sourceIds=new Set(members.map(x=>x.id));const ev=events.filter(e=>sourceIds.has(e.source_id)),evIds=new Set(ev.map(e=>e.id));
  const times=ev.map(e=>e.occurred_at||JSON.parse(e.metadata).time_range?.[1]).filter(Boolean).sort();
  rows.push(Object.fromEntries(COLUMNS.map(k=>[k,''])));
  Object.assign(rows.at(-1),{kind:isFolder&&root===f.id?'project':'task',include:isFolder?'Y':'N',project_key:isFolder?`P-${root}`:'',project_name:isFolder?require('./visibility.cjs').currentName(byId.get(root)):'미분류',task_key:isFolder&&root!==f.id?`T-${f.id}`:'',task_name:isFolder&&root!==f.id?f.name:'',folder_path:require('./visibility.cjs').currentPath(f,byId,store.driveId),folder_id:f.id,file_count:members.length,last_activity_at:times.at(-1)||'',active_people_count:new Set(actors.filter(x=>evIds.has(x.source_event_id)).map(x=>x.external_account_id)).size});
 }
 return rows.sort((a,b)=>a.folder_path.localeCompare(b.folder_path)||a.folder_id.localeCompare(b.folder_id));
});}
// Quote every field, and escape spreadsheet formula prefixes reversibly.
function encode(rows){const cell=v=>'"'+String(v??'').replace(/^['=+@\-\t\r]/,m=>"'"+m).replace(/"/g,'""')+'"';return '\ufeff'+[COLUMNS,...rows.map(r=>COLUMNS.map(k=>r[k]))].map(r=>r.map(cell).join(',')).join('\r\n')+'\r\n';}
function parse(csv){
 csv=csv.replace(/^\ufeff/,'');const records=[];let record=[],value='',quoted=false,closed=false;
 for(let i=0;i<csv.length;i++){const c=csv[i];if(quoted){if(c==='"'){if(csv[i+1]==='"'){value+='"';i++;}else{quoted=false;closed=true;}}else value+=c;continue;}
  if(c==='"'){if(value||closed)throw Error('invalid CSV quote');quoted=true;}
  else if(c===','||c==='\n'||c==='\r'){record.push(value);value='';closed=false;if(c!==','){if(c==='\r'&&csv[i+1]==='\n')i++;if(record.some(v=>v!==''))records.push(record);record=[];}}
  else {if(closed)throw Error('invalid CSV after quote');value+=c;}
 }
 if(quoted)throw Error('unterminated CSV quote');if(value||record.length){record.push(value);records.push(record);}
 const header=records.shift()||[];if(new Set(header).size!==header.length||COLUMNS.some(k=>!header.includes(k)))throw Error('required column missing or duplicate');
 return records.map(r=>{if(r.length!==header.length)throw Error('CSV column count');return Object.fromEntries(header.map((k,i)=>[k,r[i].replace(/^'(?=['=+@\-\t\r])/,'')]));});
}
function importCsv(store,csv){const rows=parse(csv);return store.db.tx(tx=>{
 const input={change_id:uuid7()},warnings=[],all=sources(tx,store.driveId),byId=new Map(all.map(s=>[s.file.id,s]));
 const projects=new Map(),tasks=new Map(),folderOwners=new Map();
 for(const [index,r] of rows.entries()){if(!validKey(r.project_key)&&(r.include==='Y'||r.project_key)||!validKey(r.task_key)&&(r.kind==='task'&&r.include==='Y'||r.task_key))throw Error(`CSV row ${index+2}: invalid project/task key`);if(!['Y','N'].includes(r.include))throw Error('include must be Y/N');if(r.include==='N')continue;
  if(!['project','task'].includes(r.kind)||!r.project_key.trim()||!r.project_name.trim())throw Error('kind/project key/name required');
  if(r.kind==='task'&&(!r.task_key.trim()||!r.task_name.trim()||!CATEGORIES.includes(r.category)))throw Error('task key/name/category required');
  const put=(map,key,value,signature)=>{const prior=map.get(key);if(prior&&prior.signature!==signature)throw Error('duplicate key conflict: '+key);if(!prior)map.set(key,{...value,signature,folders:new Set()});return map.get(key);};
  put(projects,r.project_key,{name:r.project_name},r.project_name);
  const target=r.kind==='project'?projects.get(r.project_key):put(tasks,r.task_key,{name:r.task_name,project:r.project_key,category:r.category,email:r.assignee_email},JSON.stringify([r.project_key,r.task_name,r.category,r.assignee_email]));
  if(r.folder_id){const owner=`${r.kind}:${r.kind==='project'?r.project_key:r.task_key}`;if(folderOwners.has(r.folder_id))throw Error('duplicate folder mapping: '+r.folder_id);folderOwners.set(r.folder_id,owner);
   const source=byId.get(r.folder_id);if(!source||source.file.mimeType!==FOLDER)warnings.push('Unknown folder ID: '+r.folder_id);else target.folders.add(r.folder_id);
  }
 }
 const save=(table,key,values,meta)=>{const old=row(tx,table,key);if(old)store.change(tx,table,old,{...values,metadata:JSON.stringify({...JSON.parse(old.metadata),...meta})},input,'local-pilot-user','human structure import');else{const id=add(tx,table,key,values,meta);store.audit(tx,table,id,input,'local-pilot-user','human structure import',null,meta);}};
 for(const [key,p]of projects){const old=row(tx,'projects',key),existing=old?hydrate(tx,old):{};save('projects',key,{content_id:content(tx,{...existing,title:p.name,name:p.name})},{project_id:key,drive_folder_scope:store.driveId,drive_folder_ids:[...p.folders]});}
 for(const [key,t]of tasks){let person=null;if(t.email){const matches=tx.all('SELECT * FROM external_accounts WHERE workspace_id=? AND service=? AND account_scope=? AND person_id IS NOT NULL AND is_bot=0',ws,'drive',store.driveId).filter(a=>JSON.parse(a.metadata).emailAddress?.toLowerCase()===t.email.toLowerCase());const ids=new Set(matches.map(a=>a.person_id));if(ids.size===1)person=[...ids][0];else warnings.push('Unmatched/ambiguous assignee_email: '+t.email);}
  const old=row(tx,'tasks',key),existing=old?hydrate(tx,old):{};
  save('tasks',key,{project_id:row(tx,'projects',t.project).id,assignee_id:person,category:t.category,status:old?.status||'in_progress',content_id:content(tx,{...existing,title:t.name})},{task_id:key,project_id:t.project,assignee_id:person?row(tx,'persons',person).display_key:null,drive_folder_scope:store.driveId,drive_folder_ids:[...t.folders]});
 }
 store.checkpoint('structure');const proposals=rematchTx(store,tx,input);return {projects:projects.size,tasks:tasks.size,proposals,warnings};
});}
function mappedTasks(tx,driveId,source){
 const all=sources(tx,driveId),byId=new Map(all.map(s=>[s.file.id,s])),f=hydrate(tx,source).retained_meta||{},chain=ancestors(f,byId,driveId);
 const tasks=tx.all('SELECT * FROM tasks WHERE workspace_id=?',ws);
 const distances=tasks.map(t=>{const m=JSON.parse(t.metadata);return {t,d:m.drive_folder_scope===driveId?Math.min(...(m.drive_folder_ids||[]).map(id=>{const i=chain.indexOf(id);return i<0?Infinity:i;})):Infinity};});
 const best=Math.min(...distances.map(x=>x.d));return Number.isFinite(best)?distances.filter(x=>x.d===best).map(x=>x.t):[];
}
function rematchTx(store,tx,input){let count=0;
 for(const e of tx.all('SELECT * FROM source_events WHERE workspace_id=?',ws)){const source=row(tx,'sources',e.source_id),m=JSON.parse(source.metadata);if(m.service!=='drive'||m.account_scope!==store.driveId)continue;
  // Human event/source decisions are durable. Never mutate Links or decided Reviews.
  if(tx.get("SELECT 1 FROM links WHERE workspace_id=? AND status='confirmed' AND (source_event_id=? OR source_id=?)",ws,e.id,source.id))continue;
  const reviews=tx.all("SELECT * FROM reviews WHERE workspace_id=? AND kind='link'",ws).filter(r=>JSON.parse(r.metadata).pilot&&JSON.parse(r.metadata).event_key===e.event_key);
  if(reviews.some(r=>r.status==='decided'))continue;
  const candidates=mappedTasks(tx,store.driveId,source).filter(t=>!tx.get('SELECT 1 FROM suppressions WHERE workspace_id=? AND task_id=? AND released_at IS NULL AND (source_id=? OR source_event_id=?)',ws,t.id,source.id,e.id));
  const ids=candidates.map(t=>t.display_key).sort(),task=candidates.length===1?candidates[0]:null;
  const open=reviews.filter(r=>r.status==='open');if(open.length===1&&JSON.stringify(hydrate(tx,open[0]).candidate_task_ids)===JSON.stringify(ids))continue;
  for(const r of open)store.change(tx,'reviews',r,{status:'superseded'},input,'system','structure rematch');
  const id=uuid7();add(tx,'reviews',id,{task_id:task?.id||null,kind:'link',status:'open',content_id:content(tx,{proposal:task?'폴더 매핑 연결 제안':'판단 불가',candidate_task_ids:ids,source_key:source.display_key,event_key:e.event_key,signals:{folder_ids:hydrate(tx,source).retained_meta?.parents||[]}})},{review_id:id,pilot:true,event_key:e.event_key,proposed_task_id:task?.id||null});store.audit(tx,'reviews',id,input,'system','folder mapping proposal',null,{candidate_task_ids:ids});count++;
 }return count;
}
function rematch(store){return store.db.tx(tx=>rematchTx(store,tx,{change_id:uuid7()}));}
function readCsv(file){require('./security.cjs').assertPilotPath(file);return new TextDecoder('utf-8',{fatal:true}).decode(require('node:fs').readFileSync(file));}
module.exports={readCsv,COLUMNS,CATEGORIES,draft,encode,parse,importCsv,rematch,mappedTasks};
