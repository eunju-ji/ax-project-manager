const {digest,randomUUID}=require('./store.cjs');
class Writer {
 constructor(store,clock=()=>new Date().toISOString()){this.s=store;this.clock=clock;}
 start(id,changes,metadata={}){
  const manifest=changes.map(c=>({...c,payload_digest:digest(c)}));
  for(const c of manifest){const prior=this.s.all('runs').flatMap(r=>r.manifest||[]).find(p=>p.change_id===c.change_id);if(prior&&prior.payload_digest!==c.payload_digest){this.s.put('rejections',randomUUID(),{change_id:c.change_id,result:'rejected_payload',payload:c});throw Error('rejected_payload');}}
  const old=this.s.get('runs',id);if(old){if(digest(old.manifest)!==digest(manifest))throw Error('rejected_payload');return old;}
  return this.s.put('runs',id,{run_id:id,state:'running',started_at:new Date().toISOString(),recoveries:0,...metadata,manifest});
 }
 resume(id){let run=this.s.get('runs',id);if(!run)throw Error('missing Run');if(['complete','failed'].includes(run.state))return run;
  const recovering=run.state==='incomplete';
  try{
   for(const c of run.manifest){
    let h=this.s.get('history',c.change_id);
    if(!h){
     let row=this.s.get(c.entity,c.entity_id),receipt=row?._changes?.[c.change_id];
     if(!receipt){
      const before=row?JSON.parse(JSON.stringify(row)):null; if(before) delete before._changes;
      const pending=row&&[row.created_run_id,row.run_id].filter(Boolean).some(r=>r!==id&&this.s.get('runs',r)?.state!=='complete');
      const allowed=!pending&&(!c.guard||this.guard(c.guard,row))&&(!c.requires||this.s.get('history',c.requires)?.result==='applied');
      const applied=allowed&&this.s.cas(c.entity,c.entity_id,c.expected_version,previous=>{
       const after={...previous,...c.payload,created_run_id:previous?.created_run_id||(previous?previous.run_id:run.run_id),run_id:run.run_id,version:(previous?.version||0)+1};
       const clean={...after};delete clean._changes;
       receipt={change_id:c.change_id,entity_type:c.entity,entity_id:c.entity_id,before,after:clean,result:'applied',actor_id:c.actor_id||'system',reason:c.reason||'',basis:c.basis||[],run_id:id,applied_at:this.clock()};
       return {...after,_changes:{...previous?._changes,[c.change_id]:receipt}};
      });
      if(!applied)receipt={change_id:c.change_id,result:'conflict',entity_type:c.entity,entity_id:c.entity_id,run_id:id,actor_id:c.actor_id||'system',applied_at:this.clock(),reason:c.reason||'',basis:c.basis||[],before,after:null,conflict_cause:pending?'permission':c.guard&&!this.guard(c.guard,row)?'role':c.requires&&this.s.get('history',c.requires)?.result!=='applied'?'dependency':'version'};
     }
     h=this.s.put('history',c.change_id,receipt);
    }
    if(h.result==='conflict'&&!this.s.get('reviews','conflict:'+c.change_id))this.s.put('reviews','conflict:'+c.change_id,{review_id:'conflict:'+c.change_id,kind:'conflict',status:'open',subject_type:c.entity,subject_id:c.entity_id,run_id:id,version:1});
   }
   run={...run,state:'complete',finished_at:new Date().toISOString()};
  }catch(error){run={...run,state:'incomplete',recoveries:run.recoveries+(recovering?1:0),error:error.message};if(run.recoveries>=3)run={...run,state:'failed',alert:'복구 3회 실패: 사람 확인 필요'};}
  return this.s.put('runs',id,run);
 }
 guard(g,task){const p=this.s.get('projects',task.project_id);return p&&p.version===g.project_version&&p.owner_id===g.owner_id&&p.deputy_id===g.deputy_id;}
}
module.exports={Writer};
