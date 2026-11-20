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
  const projectRange=p=>{const dates=p.tasks.flatMap(t=>[t.createdAt,...(t.subtasks||[]).map(s=>s.performedAt)]).filter(Boolean).map(day).sort();return dates.length?{start:dates[0],end:dates.at(-1)}:null;};
  const monthRange=(value,offset=0)=>{const [year,month]=day(value).split('-').map(Number);const first=new Date(Date.UTC(year,month-1+offset,1));const last=new Date(Date.UTC(first.getUTCFullYear(),first.getUTCMonth()+1,0));return {start:first.toISOString().slice(0,10),end:last.toISOString().slice(0,10),days:last.getUTCDate(),label:`${first.getUTCFullYear()}년 ${first.getUTCMonth()+1}월`};};
  const owners=rows=>{const counts=new Map();rows.forEach(p=>p.tasks.forEach(t=>{if(t.owner&&!counts.has(t.owner))counts.set(t.owner,0);(t.subtasks||[]).forEach(s=>{if(s.owner)counts.set(s.owner,(counts.get(s.owner)||0)+1);});}));return [...counts.keys()].sort((a,b)=>counts.get(b)-counts.get(a)||a.localeCompare(b,'ko'));};
  const progress=(p,asOf)=>{const percent=p.tasks.length?Math.round(p.tasks.filter(t=>t.status==='completed').length/p.tasks.length*100):0;const start=projectRange(p)?.start,dues=p.tasks.map(t=>day(t.dueDate)).filter(Boolean).sort();let schedule=null;if(start&&dues.length){const span=Date.parse(dues.at(-1))-Date.parse(start);schedule=span<=0?(day(asOf)>=start?100:0):Math.round(Math.max(0,Math.min(1,(Date.parse(day(asOf))-Date.parse(start))/span))*100);}return {percent,schedule,behind:schedule!==null&&percent<schedule};};
  const deadline=(t,asOf)=>{if(!day(t.dueDate)||t.status==='completed')return '';const diff=(Date.parse(day(t.dueDate))-Date.parse(day(asOf)))/86400000;return diff<0?'late':diff<=3?'soon':'';};
  const summaryRange=(asOf,unit,offset)=>{if(unit==='week')return weekRange(asOf,offset);if(unit==='month'){const m=monthRange(asOf,offset);return {start:m.start,end:m.end};}const d=addDays(day(asOf),offset);return {start:d,end:d};};
  const api={categories,day,addDays,weekRange,latestTask,sortProjects,weekRecords,sortedSources,projectRange,monthRange,owners,progress,deadline,summaryRange};
  if(typeof module!=='undefined')module.exports=api;else root.AXModel=api;
})(globalThis);
