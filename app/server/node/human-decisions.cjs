const fs=require('node:fs');
const path=require('node:path');
const {DatabaseSync}=require('node:sqlite');
const {digest}=require('../domain/rules.cjs');

// The JSON seed is unchanged by SQLite decisions. Reconcile only the matching
// seed, never an unrelated/stale database; failures propagate to abort the delta.
function withHumanDecisions(dataset,file){
 const sqlite=path.join(path.dirname(path.resolve(file)),'real.sqlite');
 if(!fs.existsSync(sqlite))return dataset;
 const db=new DatabaseSync(sqlite,{readOnly:true});
 try{
  db.exec('BEGIN');
  if(db.prepare('SELECT digest FROM seed_manifest').get()?.digest!==digest(dataset))return dataset;
  const changes=db.prepare("SELECT c.*,p.value AS payload FROM change_log c JOIN protected_contents p ON p.workspace_id=c.workspace_id AND p.id=c.content_id WHERE c.actor_id<>'system' AND c.entity IN ('tasks','reviews') ORDER BY c.applied_at,c.id").all();
  const next=structuredClone(dataset);next.history||=[];
  for(const change of changes){
   if(!change.payload)throw Error('missing_human_history');
   const payload=JSON.parse(change.payload),table=change.entity,key=table==='tasks'?'task_id':'review_id';
   const row=db.prepare(`SELECT * FROM ${table} WHERE workspace_id=? AND (id=? OR display_key=?)`).get(change.workspace_id,change.entity_id,change.entity_id);
   const id=row?.display_key||change.entity_id;
   const record=(next[table]||[]).find(r=>r[key]===id);
   if(record&&row){
    Object.assign(record,{status:row.status,version:row.version});
    if(table==='reviews')Object.assign(record,{decision:row.decision,applied_change_id:JSON.parse(row.metadata).applied_change_id});
   }
   const history={change_id:change.display_key,entity_type:table,entity_id:id,actor_id:change.actor_id,reason:change.reason,before:payload.before,after:payload.after,result:change.result,applied_at:change.applied_at};
   if(!next.history.some(h=>h.change_id===history.change_id&&h.entity_type===table&&h.entity_id===id))next.history.push(history);
  }
  return next;
 }finally{db.close();}
}
module.exports={withHumanDecisions};
