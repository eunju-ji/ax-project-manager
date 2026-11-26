/* Shared, dependency-free date and resource calculations. */
(function(root){
  const categories=['기획·설계','조사·분석','제작·구현','검증','운영·지원'];
  const day=value=>!value||!Number.isFinite(Date.parse(value))?'':/^\d{4}-\d{2}-\d{2}$/.test(value)?value:new Intl.DateTimeFormat('sv-SE',{timeZone:'Asia/Seoul',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date(value));
  const addDays=(date,count)=>new Date(Date.parse(date+'T00:00:00Z')+count*86400000).toISOString().slice(0,10);
  const weekRange=(date,offset=0)=>{const d=day(date);const weekday=new Date(d+'T00:00:00Z').getUTCDay();const start=addDays(d,-((weekday+6)%7)+offset*7);return {start,end:addDays(start,6)};};
  const timestamp=value=>value?Date.parse(value):0;
  const latestTask=p=>p.tasks.reduce((latest,t)=>timestamp(t.createdAt)>timestamp(latest)?t.createdAt:latest,'');
  const sortProjects=rows=>rows.slice().sort((a,b)=>timestamp(latestTask(b))-timestamp(latestTask(a))||a.id.localeCompare(b.id));
  const weekRecords=(rows,range)=>rows.flatMap(project=>project.tasks.flatMap(task=>(task.subtasks||[]).filter(s=>s.performedAtPrecision!=='unknown'&&day(s.performedAt)>=range.start&&day(s.performedAt)<=range.end).map(subtask=>({project,task,subtask})))).sort((a,b)=>timestamp(b.subtask.performedAt)-timestamp(a.subtask.performedAt));
  const sortedSources=files=>files.slice().sort((a,b)=>categories.indexOf(a.topic)-categories.indexOf(b.topic)||timestamp(b.createdAt)-timestamp(a.createdAt)||a.id.localeCompare(b.id));
  const projectRange=p=>{const dates=p.tasks.flatMap(t=>(t.subtasks||[]).filter(s=>s.performedAtPrecision!=="unknown").map(s=>s.performedAt)).filter(Boolean).map(day).sort();return dates.length?{start:dates[0],end:dates.at(-1)}:null;};
  const monthRange=(value,offset=0)=>{const [year,month]=day(value).split('-').map(Number);const first=new Date(Date.UTC(year,month-1+offset,1));const last=new Date(Date.UTC(first.getUTCFullYear(),first.getUTCMonth()+1,0));return {start:first.toISOString().slice(0,10),end:last.toISOString().slice(0,10),days:last.getUTCDate(),label:`${first.getUTCFullYear()}년 ${first.getUTCMonth()+1}월`};};
  const owners=rows=>{const counts=new Map();rows.forEach(p=>p.tasks.forEach(t=>{if(t.owner&&!counts.has(t.owner))counts.set(t.owner,0);(t.subtasks||[]).forEach(s=>{if(s.owner)counts.set(s.owner,(counts.get(s.owner)||0)+1);});}));return [...counts.keys()].sort((a,b)=>counts.get(b)-counts.get(a)||a.localeCompare(b,'ko'));};
  const progress=(p,asOf)=>{const tasks=p.tasks.filter(t=>t.planSource!=='reference'&&!t.merged_into),planned=tasks.some(t=>!!day(t.dueDate)),total=tasks.length,done=tasks.filter(t=>t.status==='completed').length,percent=total?Math.round(done/total*100):0,unverified=tasks.filter(t=>taskState(t,asOf)==='unverified').length,verified=tasks.filter(t=>taskState(t,asOf)!=='unverified'),dated=verified.filter(t=>day(t.dueDate)),elapsed=dated.filter(t=>day(t.dueDate)<day(asOf)).length,schedule=dated.length?Math.round(elapsed/dated.length*100):null,percentEx=verified.length?done/verified.length:0;return {percent,schedule,behind:schedule!==null&&percentEx<elapsed/dated.length,planned,done,total,unverified};};
  const taskState=(t,asOf)=>{if(t.status==='completed')return 'completed';const due=day(t.dueDate),start=day(t.startDate),today=day(asOf);if(due&&due<today)return (t.subtasks||[]).length?'late':'unverified';if(start)return start<=today?'active':'upcoming';return due?'active':'undated';};
  const deadline=(t,asOf)=>{if(!day(t.dueDate)||t.status==='completed')return '';const diff=(Date.parse(day(t.dueDate))-Date.parse(day(asOf)))/86400000;return diff<0?((t.subtasks||[]).length?'late':'unverified'):diff<=3?'soon':'';};
  const summaryRange=(asOf,unit,offset)=>{if(unit==='week')return weekRange(asOf,offset);if(unit==='month'){const m=monthRange(asOf,offset);return {start:m.start,end:m.end};}const d=addDays(day(asOf),offset);return {start:d,end:d};};
  const taskSchedule=(t,asOf)=>{
    const start=day(t.startDate),due=day(t.dueDate),dates=(t.subtasks||[]).filter(s=>s.performedAtPrecision!=='unknown').map(s=>day(s.performedAt)).filter(Boolean).sort();
    if(start&&due&&due<start)return {start,end:due,invalid:true};
    if(due&&!start)return {start:due,end:due,deadline:true};
    if(start&&due)return {start,end:due};
    if(start){if(t.status==='completed')return {start,end:day(t.completedAt)||dates.at(-1)||start};return {start,end:[start,day(asOf)].sort().at(-1),openEnd:true};}
    return dates.length?{start:dates[0],end:dates.at(-1),activity:true}:null;
  };
  const periodTasks=(projects,range,owner='전체')=>projects.flatMap(project=>project.tasks.filter(t=>(t.subtasks||[]).some(s=>s.performedAtPrecision!=='unknown'&&day(s.performedAt)>=range.start&&day(s.performedAt)<=range.end&&(owner==='전체'||s.owner===owner))).map(task=>({project,task})));
  const particle=(name,vowel,consonant)=>{const c=name.charCodeAt(name.length-1);return c>=44032&&c<=55203?(c-44032)%28?consonant:vowel:vowel;};
  const technical=/\b(ui|ux|sql|oauth|react|node|ci|cd|core|adapters?|workers?|delta|api|oidc|d1|jwt|csrf|mcp|sdk|sqlite|typescript|javascript|webhook|backend|frontend|cjs|json)\b|[\w-]+\.(?:js|ts|cjs|mjs)\b/i;
  const plain=value=>String(value||'').replace(/[:：]/g,' ').trim();
  const summaryVerbs={
    '기획·설계':['정리했습니다','정리하고'],'조사·분석':['조사했습니다','조사하고'],
    '제작·구현':['만들었습니다','만들고'],'검증':['확인했습니다','확인하고'],'운영·지원':['처리했습니다','처리하고']
  };
  const joinLabels=labels=>labels.length<2?labels[0]:[...labels.slice(0,-2),labels.at(-2)+particle(labels.at(-2),'와','과')+' '+labels.at(-1)].join(', ');
  const summaryLabel=r=>{
    const title=plain(r.subtask.title);if(title&&!technical.test(title))return title.replace(/[.。]$/,'');
    const fallback=[r.task.description,r.task.title].map(plain).find(t=>t&&!technical.test(t))||'관련 업무';
    return fallback.replace(/[.。]$/,'').replace(/\s*(?:정리|개발|구현|분리|검토|작성|추가|확인|분석|수정|연결|설정|설계|개선|조사|검증)(?:했습니다)?$/,'').replace(/[을를]$/,'').trim()||'관련 업무';
  };
  const workSummary=(rows,owner='전체')=>[...new Set(rows.map(r=>r.subtask.owner||''))].map(person=>{
    const work=rows.filter(r=>(r.subtask.owner||'')===person),subject=owner==='전체'?(person?person+particle(person,'는','은'):'담당자 미정은')+' ':'';
    const topic=r=>summaryVerbs[r.task.topic]?r.task.topic:'운영·지원';
    if(work.length>3){const labels=[...new Set(work.map(summaryLabel))].slice(0,2),types=[...new Set(work.map(topic))];return subject+joinLabels(labels)+' 등 '+work.length+'건을 '+types.map((type,i)=>summaryVerbs[type][i===types.length-1?0:1]).join(', ')+'.';}
    const types=[...new Set(work.map(topic))];
    return subject+types.map((type,i)=>{const labels=[...new Set(work.filter(r=>topic(r)===type).map(summaryLabel))];return joinLabels(labels)+particle(labels.at(-1),'를','을')+' '+summaryVerbs[type][i===types.length-1?0:1];}).join(', ')+'.';
  }).join(' ');
  const plannedRange=(p,asOf)=>{
    const ranges=p.tasks.filter(t=>t.planSource!=='reference'&&!t.merged_into).map(t=>taskSchedule(t,asOf)).filter(r=>r&&!r.invalid);
    return ranges.length?{start:ranges.map(r=>r.start).sort()[0],end:ranges.map(r=>r.end).sort().at(-1),...(ranges.some(r=>r.openEnd)?{openEnd:true}:{})}:projectRange(p);
  };
  const normalizeTheme=v=>['linear','linear-notion','layout-2','layout-3'].includes(v)?v:'linear-notion';
  const eligible=t=>!t.merged_into&&t.planSource!=='reference';
  const weekWork=(t,r)=>(t.subtasks||[]).filter(s=>s.performedAtPrecision!=='unknown'&&day(s.performedAt)>=r.start&&day(s.performedAt)<=r.end);
  const recentRange=asOf=>({start:addDays(day(asOf),-13),end:day(asOf)});
  const overlaps=(t,r)=>{const start=day(t.startDate),due=day(t.dueDate);if(start&&due&&due<start)return false;return !!(start&&due?start<=r.end&&due>=r.start:!!(start||due)&&(start||due)>=r.start&&(start||due)<=r.end);};
  const recentDue=(t,asOf)=>{const due=day(t.dueDate),today=day(asOf);return !!due&&due<today&&due>=addDays(today,-30);};
  const currentTask=(t,asOf)=>weekWork(t,recentRange(asOf)).length>0||overlaps(t,weekRange(asOf))||recentDue(t,asOf);
  const taskRows=projects=>projects.flatMap(project=>project.tasks.filter(t=>eligible(t)&&t.status!=='completed').map(task=>({project,task})));
  const stalledTasks=(projects,asOf)=>taskRows(projects).filter(({task:t})=>!currentTask(t,asOf)&&!(day(t.startDate)>day(asOf)||day(t.dueDate)>day(asOf)));
  const weekTasks=(projects,r,asOf=r.start)=>taskRows(projects).filter(({task:t})=>overlaps(t,r)||currentTask(t,asOf)&&(!day(t.dueDate)||day(t.dueDate)<day(asOf))).sort((a,b)=>Number(!!day(b.task.dueDate)&&day(b.task.dueDate)<day(asOf))-Number(!!day(a.task.dueDate)&&day(a.task.dueDate)<day(asOf))||Number(a.project.kind==='ops')-Number(b.project.kind==='ops')||(day(a.task.dueDate)||'9999').localeCompare(day(b.task.dueDate)||'9999'));
  const nextTask=p=>{const tasks=p.tasks.filter(t=>eligible(t)&&t.status!=='completed');return tasks.filter(t=>day(t.dueDate)).sort((a,b)=>day(a.dueDate).localeCompare(day(b.dueDate)))[0]||tasks.filter(t=>day(t.startDate)).sort((a,b)=>day(a.startDate).localeCompare(day(b.startDate)))[0]||tasks[0];};
  const stageStates=(p,asOf)=>['리서치','기획','프로토타입','개발·테스트','출시·운영'].filter(stage=>p.tasks.some(t=>eligible(t)&&t.stage===stage)).map(stage=>{const tasks=p.tasks.filter(t=>eligible(t)&&t.stage===stage);return {stage,status:tasks.every(t=>t.status==='completed')?'완료':tasks.some(t=>t.status!=='completed'&&(day(t.startDate)?day(t.startDate)<=day(asOf):(t.subtasks||[]).some(s=>s.performedAtPrecision!=='unknown'&&day(s.performedAt)&&day(s.performedAt)<=day(asOf))))?'진행':'예정'};});
  const nextWeekTasks=(projects,asOf,datedOnly=false)=>taskRows(projects).filter(({task:t})=>(!datedOnly||!!day(t.dueDate))&&overlaps(t,weekRange(asOf,1)));
  const nextWorkday=value=>{let d=addDays(day(value),1);while([0,6].includes(new Date(d+'T00:00:00Z').getUTCDay()))d=addDays(d,1);return d;};
  const resourcePeople=(projects,asOf)=>{
    const today=day(asOf),recent=recentRange(today),next=weekRange(today,1),stopped=stalledTasks(projects,today);
    const all=projects.flatMap(project=>project.tasks.filter(eligible).map(task=>({project,task})));
    const upcoming=nextWeekTasks(projects,today),work=weekRecords(projects,recent);
    return owners(projects).map(owner=>{
      const stalled=stopped.filter(r=>r.task.owner===owner),stalledIds=new Set(stalled.map(r=>r.task.id));
      const logs=work.filter(r=>r.subtask.owner===owner&&!stalledIds.has(r.task.id)),total=logs.length;
      const allocation=projects.map(project=>({project,count:logs.filter(r=>r.project.id===project.id).length})).filter(r=>r.count).map(r=>({...r,percent:Math.round(r.count/total*100)}));
      const current=all.filter(({task:t})=>t.status!=='completed'&&(t.owner===owner&&currentTask(t,today)||weekWork(t,recent).some(s=>s.owner===owner)));
      const nextTasks=upcoming.filter(r=>r.task.owner===owner);
      const planned=all.filter(({task:t})=>t.status!=='completed'&&t.owner===owner&&day(t.startDate)>next.end);
      const dates=current.map(r=>day(r.task.dueDate)).filter(Boolean).sort(),unknown=current.filter(r=>!day(r.task.dueDate)).length;
      const busy=[...new Map([...current,...nextTasks].map(r=>[r.task.id,r])).values()];
      const last=busy.map(r=>day(r.task.dueDate)).filter(Boolean).sort().at(-1);
      const available=current.length?[nextWorkday(today),...(last?[nextWorkday(last)]:[])].sort().at(-1):today;
      const overdue=current.filter(r=>day(r.task.dueDate)&&day(r.task.dueDate)<today).length;
      return {owner,total,allocation,current,next:nextTasks,planned,stalled,end:dates.at(-1)||'',unknown,overdue,available,now:!current.length};
    });
  };
  const api={stalledTasks,nextWeekTasks,normalizeTheme,weekTasks,weekWork,resourcePeople,nextTask,stageStates,particle,periodTasks,workSummary,taskSchedule,plannedRange,categories,day,addDays,weekRange,latestTask,sortProjects,weekRecords,sortedSources,projectRange,monthRange,owners,progress,taskState,deadline,summaryRange};
  if(typeof module!=='undefined')module.exports=api;else root.AXModel=api;
})(globalThis);
