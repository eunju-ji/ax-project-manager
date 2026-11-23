function transition(s,w,input){
 const {change_id,task_id,actor_id,to,reason='',expected_version}=input;
 const existing=s.get('runs',change_id);if(existing){if(JSON.stringify(existing.input)!==JSON.stringify(input))throw Error('rejected_payload');return w.resume(change_id);}
 const t=s.get('tasks',task_id),p=t&&s.get('projects',t.project_id);if(!t||!p)throw Error('transition missing task');
 const assignee=t.assignee_id===actor_id,confirmer=!!actor_id&&(p.owner_id===actor_id||p.deputy_id===actor_id);
 const valid=(t.status==='in_progress'&&to==='completion_proposed'&&assignee)||(t.status==='completion_proposed'&&to==='completed'&&confirmer)||(t.status==='completion_proposed'&&to==='in_progress'&&(assignee||(confirmer&&reason.trim())))||(t.status==='in_progress'&&to==='completed'&&assignee&&confirmer)||(t.status==='completed'&&to==='in_progress'&&(assignee||confirmer)&&reason.trim());
 // Stale version goes through CAS even when current state no longer permits that transition.
 if(!valid&&expected_version===t.version)throw Error('transition forbidden');
 const changes=[{change_id,entity:'tasks',entity_id:task_id,expected_version,payload:{status:to,self_approved:to==='completed'&&assignee&&confirmer},actor_id,reason,basis:input.basis||[],guard:{project_version:p.version,owner_id:p.owner_id,deputy_id:p.deputy_id}}];
 if(to==='in_progress'&&expected_version===t.version)for(const r of s.all('reviews').filter(r=>r.subject_id===task_id&&r.kind==='completion'&&r.status==='open'))changes.push({change_id:change_id+':'+r.review_id,entity:'reviews',entity_id:r.review_id,expected_version:r.version||0,requires:change_id,payload:{status:'superseded'}});
 if(input.reservation){changes.unshift(input.reservation);changes[1].requires=input.reservation.change_id;}
 if(input.review_change) changes.push({...input.review_change,requires:change_id});
 const run=w.start(change_id,changes,{input,...input.run_metadata});return input.plan_only ? run : w.resume(change_id);
}
module.exports={transition};
