import transitions from '../../server/core/transitions.cjs';
import deltaCore from '../../server/core/delta.cjs';
import viewCore from '../../server/core/view.cjs';
import {hash} from './crypto.js';
/** Local synthetic implementation only. No durability across isolates/restarts.
 * TODO stage 3: D1 transaction + idempotency + audit, retain SQLite schema IDs/versions.
 */
export function createMemoryStorage({dataset={},users=[],tokens={}}={}){
 let data=structuredClone({persons:[],projects:[],tasks:[],worklogs:[],sources:[],links:[],reviews:[],sourceEvents:[],runs:[],...dataset}),state={},cursor=0;
 const requests=new Map();
 const userMap=new Map(users.map(u=>[u.email,u])),sessions=new Map(),tokenMap=new Map(Object.entries(tokens)),inbox=[],seen=new Set(),audit=[];let queue=Promise.resolve();
 const atomic=fn=>{const next=queue.then(fn);queue=next.catch(()=>{});return next;};
 return {
 view:async()=>({...viewCore.makeView(data),collectedOn:String(data.demoAsOf||''),demoNotice:String(data.demoNotice||''),demoAsOf:new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Seoul'}).format(new Date())}),
 decide:input=>atomic(()=>{
  const conflict=()=>{throw Object.assign(Error(),{status:409});};const prior=requests.get(input.change_id);if(prior){if(prior.payload!==JSON.stringify(deltaCore.canonical(input)))return conflict();return structuredClone(prior.result);}
  const review=data.reviews.find(r=>r.review_id===input.review_id);if(!review||review.kind!=='completion'||review.status==='superseded')return conflict();
  if(review.status==='decided'){if(review.decision!==input.answer)return conflict();return {change_id:review.applied_change_id,state:'complete'};}
  const task=data.tasks.find(t=>t.task_id===(review.task_id||review.subject_id));if(!task||(task.version||1)!==input.expected_version)return conflict();
  let nextTask=task;const history=[...(data.history||[])];
  if(input.answer==='\uC644\uB8CC'){
   const project=data.projects.find(p=>p.project_id===task.project_id);if(!project||!transitions.canTransition(task,project,task.assignee_id,'completed','Review completion'))return conflict();
   nextTask={...task,status:'completed',version:(task.version||1)+1};
   history.push({change_id:input.change_id+'-task',entity_type:'tasks',entity_id:task.task_id,actor_id:task.assignee_id,reason:'task transition',before:{status:task.status,version:task.version||1},after:{status:nextTask.status,version:nextTask.version},result:'applied',applied_at:new Date().toISOString()});
  }
  const nextReview={...review,status:'decided',decision:input.answer,applied_change_id:input.change_id};
  // Publish state and its human history together inside the same serialized operation.
  data={...data,tasks:data.tasks.map(t=>t===task?nextTask:t),reviews:data.reviews.map(r=>r===review?nextReview:r),history};
  const result={change_id:input.change_id,state:'complete'};requests.set(input.change_id,{payload:JSON.stringify(deltaCore.canonical(input)),result});audit.push({action:'decision',actor:task.assignee_id});return structuredClone(result);
 }),
 applyDelta:(delta,{dryRun=false}={})=>atomic(async()=>{const digest=await hash(JSON.stringify(deltaCore.canonical(delta)));const r=deltaCore.merge(data,state,delta,{digest:()=>digest,equal:(a,b)=>JSON.stringify(deltaCore.canonical(a))===JSON.stringify(deltaCore.canonical(b))});if(r.ok&&!dryRun){data=r.dataset;state=r.state;}return r;}),
 getUser:async email=>structuredClone(userMap.get(email)||null),saveUser:async u=>{userMap.set(u.email,structuredClone(u));},
 getSession:async id=>structuredClone(sessions.get(id)||null),saveSession:async(id,s)=>{if(s)sessions.set(id,structuredClone(s));else sessions.delete(id);},
 getToken:async digest=>structuredClone(tokenMap.get(digest)||null),saveToken:async(digest,t)=>{if(t)tokenMap.set(digest,structuredClone(t));else tokenMap.delete(digest);},
 audit:async(action,actor)=>{audit.push({action,actor});},
 putInbox:(person,records)=>atomic(()=>{for(const r of records){const key=JSON.stringify([person,r.id]);if(!seen.has(key)){seen.add(key);inbox.push({cursor:++cursor,person_id:person,payload:structuredClone(r)});}}return {ok:true};}),
 getInbox:async since=>{const records=inbox.filter(r=>r.cursor>Number(since)).slice(0,200);return {records:structuredClone(records),cursor:String(records.at(-1)?.cursor||since)};}
 };
}
