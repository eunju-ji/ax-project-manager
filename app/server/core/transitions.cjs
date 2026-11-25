function canTransition(t,p,actor,to,reason=''){
 const a=t.assignee_id===actor,c=!!actor&&(p.owner_id===actor||p.deputy_id===actor);
 return (t.status==='in_progress'&&to==='completion_proposed'&&a)||(t.status==='completion_proposed'&&to==='completed'&&c)||(t.status==='completion_proposed'&&to==='in_progress'&&(a||(c&&!!reason.trim())))||(t.status==='in_progress'&&to==='completed'&&a&&c)||(t.status==='completed'&&to==='in_progress'&&(a||c)&&!!reason.trim());
}
module.exports={canTransition};
