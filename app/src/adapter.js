/* Read-only projection of persisted operational snapshots; no matching or writes. */
(function(root){
  const lexical=(a,b)=>a<b?-1:a>b?1:0;
  const time=s=>Number.isFinite(Date.parse(s))?Date.parse(s):0;
  const roles=['산출물','검토','요청','참고'];
  // Only original-service links on known hosts are exposed; anything else (example.invalid, javascript:, http:) is dropped.
  const linkHosts=['drive.google.com','docs.google.com','chat.google.com','mail.google.com','github.com'];
  const safeUrl=u=>{try{const x=new URL(u);return x.protocol==='https:'&&(linkHosts.includes(x.hostname)||x.hostname.endsWith('.sharepoint.com'))?x.href:'';}catch{return '';}};
  function adapt(data){
    const runs=new Map((data.runs||[]).map(r=>[r.run_id,r.state]));
    // Manual records may omit run_id; an explicit unknown/noncomplete Run fails closed.
    const visible=r=>[r.created_run_id,r.run_id].filter(Boolean).every(id=>runs.get(id)==='complete');
    const unique=(rows,key)=>[...new Map((rows||[]).filter(visible).map(r=>[r[key],r])).values()].sort((a,b)=>lexical(a[key],b[key]));
    const persons=new Map((data.persons||[]).map(p=>[p.person_id,p.display_name]));
    const owner=id=>id==='unknown'?'':persons.get(id)||'';
    // 자료 = file-form sources only. Message/mail bodies (kind 'message') stay as evidence in the DB but are not 자료.
    const sources=new Map(unique(data.sources,'source_key').filter(s=>s.kind!=='message').map(s=>[s.source_key,s]));
    const events=new Map(unique(data.sourceEvents,'event_key').map(e=>[e.event_key,e]));
    const logs=unique(data.worklogs,'worklog_id').filter(w=>runs.get(w.run_id)==='complete');
    const allTasks=unique(data.tasks,'task_id');
    const tasks=allTasks.filter(t=>t.plan_source!=='reference' && t.merged_into == null);
    const logMap=new Map(logs.map(w=>[w.worklog_id,w]));
    const taskMap=new Map(tasks.map(t=>[t.task_id,t]));
    const links=unique(data.links,'link_id').filter(l=>l.status==='confirmed').flatMap(l=>{
      const sourceKey=l.evidence_type==='source'?l.evidence_key:l.evidence_type==='event'?events.get(l.evidence_key)?.source_key:null;
      const taskId=l.target_type==='task'?l.target_id:l.target_type==='worklog'?logMap.get(l.target_id)?.task_id:null;
      return sources.has(sourceKey)&&taskMap.has(taskId)?[{...l,sourceKey,taskId}]:[];
    });
    const role=l=>roles.includes(l.role)?roles.indexOf(l.role):roles.length;
    const representative=(a,b)=>role(a)-role(b)||time(b.decided_at)-time(a.decided_at)||lexical(a.link_id,b.link_id);
    const projects=unique(data.projects,'project_id').filter(p=>!allTasks.some(t=>t.project_id===p.project_id)||tasks.some(t=>t.project_id===p.project_id)).map(p=>{
      const projectTasks=tasks.filter(t=>t.project_id===p.project_id);
      const projectLinks=links.filter(l=>projectTasks.some(t=>t.task_id===l.taskId));
      const files=[...new Set(projectLinks.map(l=>l.sourceKey))].sort(lexical).map(key=>{
        const candidates=projectLinks.filter(l=>l.sourceKey===key).sort((a,b)=>time(b.decided_at)-time(a.decided_at)||lexical(a.taskId,b.taskId)||lexical(a.link_id,b.link_id));
        const t=taskMap.get(candidates[0].taskId),s=sources.get(key);
        return {...(s.folder_id?{folderId:s.folder_id}:{}),...(Array.isArray(s.folder_path)&&s.folder_path.every(x=>typeof x==='string')&&s.folder_path.length?{folderPath:s.folder_path.slice()}:{}),...(safeUrl(s.folder_uri)?{folderUrl:safeUrl(s.folder_uri)}:{}),id:key,name:s.title||'',type:'',source:key.startsWith('github:')?'GitHub':/^chat(-file)?:/.test(key)?'Google Chat':/^gmail(-att)?:/.test(key)?'Gmail':key.startsWith('sharepoint:')?'SharePoint':key.startsWith('calendar:')?'Google Calendar':'Google Drive',summary:'',topic:t.category,taskId:t.task_id,createdAt:s.created_at||'',availability:s.availability,previewable:s.availability==='available',...(safeUrl(s.uri)?{url:safeUrl(s.uri)}:{})};
      });
      return {id:p.project_id,name:p.name,desc:p.purpose||'',owner:p.display_owner||owner(p.owner_id),files,tasks:projectTasks.map(t=>({id:t.task_id,wbsCode:t.wbs_code||undefined,wbsGroups:t.wbs_groups||[],startDate:t.start_date||undefined,planSource:t.plan_source||'activity',dueDate:t.due_date||undefined,status:t.status,completedAt:t.completed_at||undefined,completionBasis:t.completion_basis||undefined,title:t.title,description:t.description||undefined,topic:t.category,summary:t.summary||'',detail:t.completion_criteria||'',decision:t.decision||'',weeklySummary:t.weekly_summary||'',owner:owner(t.assignee_id),createdAt:t.created_at||'',subtasks:logs.filter(w=>w.task_id===t.task_id).map(w=>{
        const link=projectLinks.filter(l=>l.target_type==='worklog'&&l.target_id===w.worklog_id).sort(representative)[0];
        const precision=w.performed_at_precision;
        const performedAt=precision==='unknown'?'':precision==='date'?(w.performed_at||'').slice(0,10):w.performed_at||'';
        return {id:w.worklog_id,title:w.title||w.summary,summary:w.summary,owner:owner(w.performer_id),performedAt,performedAtPrecision:precision,artifact:link?sources.get(link.sourceKey).title:'',...(link?{sourceId:link.sourceKey}:{})};
      })}))};
    });
    const reviews=unique(data.reviews,'review_id').filter(r=>r.kind==='completion'&&r.status==='open'&&r.subject_type==='task'&&taskMap.has(r.subject_id)&&projects.some(p=>p.id===taskMap.get(r.subject_id).project_id)).map(r=>({id:r.review_id,kind:r.kind,taskId:r.subject_id,project:taskMap.get(r.subject_id).project_id,title:taskMap.get(r.subject_id).title,desc:typeof r.proposal==='string'?r.proposal:'',source:''}));
    const linkedSources=new Set(links.map(l=>l.sourceKey));
    const folders=Object.create(null);
    for(const s of sources.values())if(s.folder_id){
      (folders[s.folder_id]||=[]).push({id:s.source_key,name:s.title||'',kind:s.kind,modifiedAt:s.modified_at||'',linked:linkedSources.has(s.source_key),...(safeUrl(s.uri)?{url:safeUrl(s.uri)}:{})});
    }
    for(const rows of Object.values(folders))rows.sort((a,b)=>a.name.localeCompare(b.name,'ko')||lexical(a.id,b.id));
    return {projects,reviews,folders,demoAsOf:data.demoAsOf||'',demoNotice:data.demoNotice||''};
  }
  const api={adapt};if(typeof module!=='undefined')module.exports=api;else root.AXAdapter=api;
})(globalThis);
