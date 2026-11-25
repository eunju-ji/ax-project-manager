const {adapt}=require('../../src/adapter.js');
const visibility=require('../connectors/drive/visibility.cjs');
function makeView(snapshot){
  const data=structuredClone(snapshot);data.demoAsOf='2026-11-17';
  data.tasks=data.tasks.filter(t=>!t.merged_into&&!t.split_into);
  const visible=r=>[r.run_id,r.created_run_id].filter(Boolean).every(id=>data.runs.find(r=>r.run_id===id)?.state==='complete');
  for(const k of Object.keys(data))if(Array.isArray(data[k])&&k!=='runs')data[k]=data[k].filter(visible);
  const driveSources=new Map(data.sources.filter(s=>s.service==='drive').map(s=>[s.file_id,{availability:s.availability,file:s.retained_meta}]));
  data.sources=data.sources.map(s=>s.service==='drive'&&(s.availability!=='available'||visibility.hiddenAncestor(s.retained_meta,driveSources,s.account_scope))?{...s,title:'',retained_meta:undefined}:s);
  data.sources=data.sources.map(s=>s.retained_meta?{...s,retained_meta:{...s.retained_meta,folderPath:visibility.currentPath(s.retained_meta,driveSources,s.account_scope)}}:s);
  data.reviews=data.reviews.map(r=>{const e=data.sourceEvents.find(e=>e.event_key===r.event_key),source=data.sources.find(s=>s.source_key===(r.source_key||e?.source_key));if(source?.service!=='drive'&&!r.pilot)return r;return visibility.presentReview(r,source?{...source,file:driveSources.get(source.file_id)?.file}:null,driveSources,source?.account_scope);});
  const view=adapt({...data,reviews:data.reviews.map(r=>r.status==='decided'?{...r,status:'open'}:r)});
  return {...view,decisions:data.reviews.filter(r=>r.status==='decided'),taskStates:data.tasks.map(t=>({id:t.task_id,status:t.status,version:t.version}))};
}
module.exports={makeView};
