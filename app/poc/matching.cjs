const {randomUUID,digest}=require('./store.cjs');
const {normalize}=require('./collector.cjs');
const {fakeLLM}=require('./fake-llm.cjs');
class Matcher {
 constructor(s,w){this.s=s;this.w=w;}
 write(changes){const id=randomUUID();this.w.start(id,changes.map((c,i)=>({change_id:id+':'+i,expected_version:0,...c})));return this.w.resume(id);}
 review(kind,event,proposal){const id=randomUUID();return this.write([{entity:'reviews',entity_id:id,payload:{review_id:id,kind,subject_type:'task',subject_id:proposal?.task_id,proposal,status:'open',basis_links:[event.event_key]}}]);}
 collect(events,options={}){if(options===true||options.permission==='denied'){const id=randomUUID();this.s.put('runs',id,{run_id:id,state:'failed',error:'permission denied',manifest:[]});return [{status:'failed'}];}
  return events.map(input=>{const e=normalize(input),old=this.s.get('sourceEvents',e.event_key);
   if(old){if(old.normalized_payload_digest!==e.normalized_payload_digest){const id=e.event_key+':'+e.normalized_payload_digest;if(!this.s.get('eventConflicts',id)){this.write([{entity:'eventConflicts',entity_id:id,payload:e}]);this.review('conflict',e,{previous:old,incoming:e});}return {status:'conflict',event:e};}
    if(old.run_id&&this.s.get('runs',old.run_id)?.state!=='complete'){this.review('conflict',e,{reason:'incomplete collection'});return {status:'incomplete',event:e};}return {status:'duplicate',event:old};}
   const run=this.write([{entity:'sourceEvents',entity_id:e.event_key,payload:e}]);if(run.state!=='complete')this.review('conflict',e,{reason:'incomplete collection'});return {status:run.state==='complete'?'new':'incomplete',event:e};});
 }
 blocked(e,target){return this.s.all('suppressions').some(s=>!(s.released_at&&(!s.run_id||this.s.get('runs',s.run_id)?.state==='complete'))&&s.target_id===target&&(s.scope==='source'?s.evidence_key===e.source_key:s.evidence_key===e.event_key));}
 match(e,proposal){
  const [collected]=this.collect([e]);if(!['new','duplicate'].includes(collected.status))return {suppressed:false,collection:collected.status};e=collected.event;proposal=proposal||fakeLLM(e);
  const ids=[...new Set((e.text||'').match(/TSK-[a-zA-Z0-9-]+/g)||[])];
  for(const id of ids){const t=this.s.get('tasks',id),p=t&&this.s.get('projects',t.project_id);if(this.blocked(e,id)){this.review('conflict',e,{task_id:id});continue;}
   const scope=e.source_key.split(':').slice(0,2).join(':');if(!p?.approved_scopes?.includes(scope)){this.review('conflict',e,{task_id:id,reason:'scope'});continue;}
   const link_id=digest([e.event_key,id]);if(!this.s.get('links',link_id))this.write([{entity:'links',entity_id:link_id,payload:{link_id,target_type:'task',target_id:id,evidence_type:'event',evidence_key:e.event_key,status:'confirmed',basis:'explicit task ID',decided_by:'system'}}]);
  }
  if(proposal.task_id&&this.blocked(e,proposal.task_id))return {suppressed:true};
  if(proposal.action!=='review'||proposal.task_id)this.review(proposal.action==='complete'?'completion':proposal.action==='new_task'?'new_task':'link',e,proposal);
  return {suppressed:false};
 }
 updateAvailability(source_key,availability){
  if(!['available','access_denied','moved','deleted','unknown'].includes(availability))throw Error('availability');
  const row=this.s.get('sources',source_key);if(!row)throw Error('source');return this.write([{entity:'sources',entity_id:source_key,expected_version:row.version||0,payload:{availability,availability_checked_at:new Date().toISOString()}}]);
 }
 updateSummary(worklog_id,summary){const row=this.s.get('worklogs',worklog_id);if(!row||[row.created_run_id,row.run_id].filter(Boolean).some(id=>this.s.get('runs',id)?.state!=='complete')||row.summary_origin!=='system')return {rejected:true};return this.write([{entity:'worklogs',entity_id:worklog_id,expected_version:row.version,payload:{summary}}]);}
 reject(link_id,actor,scope='source'){
  const l=this.s.get('links',link_id);if(!l)throw Error('link required');const e=l.evidence_type==='event'?this.s.get('sourceEvents',l.evidence_key):null;const evidence=scope==='source'?(l.evidence_type==='source'?l.evidence_key:e?.source_key):l.evidence_type==='event'?l.evidence_key:null;
  if(!evidence)throw Error('source event required');
  const id=randomUUID();this.write([{entity:'links',entity_id:link_id,expected_version:l.version,payload:{status:'rejected',decided_by:actor}},{entity:'suppressions',entity_id:id,payload:{suppression_id:id,scope,evidence_type:scope==='source'?'source':'event',evidence_key:evidence,target_type:l.target_type,target_id:l.target_id,created_by:actor,created_at:new Date().toISOString()}}]);return id;
 }
 release(id,actor){const row=this.s.get('suppressions',id);return this.write([{entity:'suppressions',entity_id:id,expected_version:row.version,payload:{released_by:actor,released_at:new Date().toISOString()}}]);}
}
module.exports={Matcher};
