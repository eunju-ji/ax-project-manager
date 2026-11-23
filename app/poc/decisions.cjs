const {transition}=require('./transitions.cjs');
function decide(s,w,input){
 const {review_id,answer,change_id,expected_version}=input;
 const prior=s.get('runs',change_id);
 if(prior){if(JSON.stringify(prior.request)!==JSON.stringify(input))throw Error('rejected_payload');const result=recoverDecision(s,w,change_id);if(result.state!=='complete'||s.get('reviews',review_id)?.status!=='decided')throw Error('save failed');return result;}
 let r=s.get('reviews',review_id);if(r?.status==='deciding'&&r.applied_change_id){if(s.get('runs',r.applied_change_id)?.state==='complete')recoverDecision(s,w,r.applied_change_id);r=s.get('reviews',review_id);}if(!r||r.kind!=='completion'||r.status==='superseded')throw Error('invalid review');
 if(r.status==='deciding'||(r.applied_change_id&&s.get('runs',r.applied_change_id)?.state!=='complete'))throw Error('review conflict: reserved');
 if(r.status==='decided')return {change_id:r.applied_change_id,state:'complete'};
 if(r.run_id&&s.get('runs',r.run_id)?.state!=='complete')throw Error('review conflict: incomplete');
 const task=s.get('tasks',r.subject_id);if(!task)throw Error('invalid task');const actor_id=task.assignee_id;
 const audit={actor_id,reason:'Review '+answer+' 판단',basis:[review_id,...(r.basis_links||[])]};
 const reservation={change_id:change_id+':reserve',entity:'reviews',entity_id:review_id,expected_version:r.version||0,payload:{status:'deciding',reserved_by:actor_id,reserved_answer:answer,applied_change_id:change_id},...audit};
 const c={change_id:change_id+':decision',entity:'reviews',entity_id:review_id,expected_version:(r.version||0)+1,payload:{status:'decided',decision:answer,decided_by:actor_id,decided_at:w.clock(),applied_change_id:change_id},...audit};
 if(answer==='완료')transition(s,w,{change_id,task_id:task.task_id,actor_id,to:'completed',expected_version,reservation,review_change:c,plan_only:true,reason:audit.reason,basis:audit.basis,run_metadata:{request:input}});
 else w.start(change_id,[reservation,{...c,requires:reservation.change_id}],{request:input});
 const result=recoverDecision(s,w,change_id);if(result.state!=='complete'||s.get('reviews',review_id)?.status!=='decided')throw Error('save failed');return result;
}
// A terminal conflict receipt proves non-application. Missing evidence never releases a reservation.
function recoverDecision(s,w,id){
 const run=w.resume(id),request=run.request;if(!request||run.state!=='complete')return run;
 const pendingRepair=s.get('runs',id+':repair');if(pendingRepair){const result=w.resume(id+':repair');return result.state==='complete'?run:result;}
 const r=s.get('reviews',request.review_id);if(r?.status!=='deciding'||r.applied_change_id!==id)return run;
 const taskChange=run.manifest.find(c=>c.entity==='tasks');
 const taskReceipt=taskChange&&(s.get('history',taskChange.change_id)||s.get('tasks',taskChange.entity_id)?._changes?.[taskChange.change_id]);
 const final=run.manifest.find(c=>c.change_id===id+':decision');
 if(!final||!taskReceipt)return run;
 const payload=taskReceipt.result==='conflict'?{status:'open',reserved_by:null,reserved_answer:null,applied_change_id:null}:taskReceipt.result==='applied'?final.payload:null;
 if(!payload)return run;
 const repair=id+':repair';
 if(!s.get('runs',repair))w.start(repair,[{change_id:repair,entity:'reviews',entity_id:r.review_id,expected_version:r.version,payload,actor_id:final.actor_id,reason:taskReceipt.result==='conflict'?'Task 미적용 확정: 예약 해제':'Task 적용 확정: 판단 복구',basis:[id,taskChange.change_id]}]);
 const repaired=w.resume(repair);return repaired.state==='complete'?run:repaired;
}
function recoveryRequests(s){return s.all('runs').filter(r=>r.request&&(r.state!=='complete'||(s.get('runs',r.run_id+':repair')&&s.get('runs',r.run_id+':repair').state!=='complete')||(s.get('reviews',r.request.review_id)?.status==='deciding'&&s.get('reviews',r.request.review_id)?.applied_change_id===r.run_id))).map(r=>({change_id:r.run_id,state:r.state,request:r.request,review_status:s.get('reviews',r.request.review_id)?.status}));}
module.exports={decide,recoverDecision,recoveryRequests};
