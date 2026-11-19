const http=require('node:http');
const fs=require('node:fs');
const path=require('node:path');
const {Store,digest}=require('./store.cjs');
const {Writer}=require('./write-service.cjs');
const {adapt}=require('../src/adapter.js');
const {decide,recoverDecision,recoveryRequests}=require('./decisions.cjs');
function seedSmall(s){if(s.get('projects','PRJ-LOCAL'))return;
 s.put('persons','P1',{person_id:'P1',display_name:'김지현'});
 s.put('projects','PRJ-LOCAL',{project_id:'PRJ-LOCAL',name:'로컬 합성 PoC',owner_id:'P1',version:1,approved_scopes:['github:synthetic']});
 s.put('tasks','TSK-LOCAL',{task_id:'TSK-LOCAL',project_id:'PRJ-LOCAL',title:'로컬 저장 검증',category:'검증',assignee_id:'P1',status:'in_progress',version:1,created_at:'2026-11-17'});
 for(const n of [1,2])s.put('reviews','RV-'+n,{review_id:'RV-'+n,kind:'completion',subject_type:'task',subject_id:'TSK-LOCAL',proposal:'합성 완료 제안 '+n,status:'open',version:1});
}
function seedLarge(s){
 if(s.all('projects').length)return;
 const data=require('./dataset/synthetic-large.json');
 const keys={persons:'person_id',projects:'project_id',tasks:'task_id',worklogs:'worklog_id',sources:'source_key',sourceEvents:'event_key',links:'link_id',reviews:'review_id',runs:'run_id',suppressions:'suppression_id',history:'change_id'};
 for(const [table,key] of Object.entries(keys))for(const row of data[table]||[])s.put(table,row[key],row);
}
function createServer({dir=path.join(__dirname,'.runtime'),seedMode='large',reset=false}={}){
 dir=path.resolve(dir);
 const desired={name:seedMode==='small'?'synthetic-small':'synthetic-large',seed:seedMode==='small'?1:require('./dataset/generate.cjs').SEED,hash:digest(seedMode==='small'?'small-v1':fs.readFileSync(path.join(__dirname,'dataset/synthetic-large.json'),'utf8'))};
 let s=new Store(dir);
 if(seedMode!=='none'){
  const meta=s.get('metadata','seed');
  if((reset||digest(meta)!==digest(desired))&&fs.readdirSync(dir).length){
   // Reject moving a root or any ancestor of this project. Backup stays beside the exact runtime.
   const relative=path.relative(dir,path.resolve(__dirname,'..','..'));
   if(dir===path.parse(dir).root||relative===''||(!relative.startsWith('..'+path.sep)&&!path.isAbsolute(relative)))throw Error('unsafe runtime directory');
   const backup=dir+'.backup-'+Date.now()+'-'+require('node:crypto').randomUUID();
   if(path.dirname(backup)!==path.dirname(dir))throw Error('unsafe backup');
   fs.renameSync(dir,backup);console.log('Runtime backed up: '+backup);s=new Store(dir);
  }
  if(!s.get('metadata','seed')){if(seedMode==='small')seedSmall(s);else seedLarge(s);s.put('metadata','seed',desired);}
  console.log('Dataset: '+desired.name+'; projects='+s.all('projects').length);
 }
 const w=new Writer(s);
 const server=http.createServer(async(req,res)=>{
  const json=(code,data)=>{res.writeHead(code,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'});res.end(JSON.stringify(data));};
  try{
   const host=req.headers.host;if(!/^127\.0\.0\.1:\d+$/.test(host||''))return json(403,{error:'host'});
   if(req.headers.origin&&req.headers.origin!==`http://${host}`)return json(403,{error:'origin'});
   const url=new URL(req.url,`http://${host}`);
   if(req.method==='GET'&&url.pathname==='/api/view'){
    const snapshot=s.snapshot();const visible=r=>[r.created_run_id,r.run_id].filter(Boolean).every(id=>s.get('runs',id)?.state==='complete');for(const key of Object.keys(snapshot))if(key!=='runs')snapshot[key]=snapshot[key].filter(visible);snapshot.demoAsOf='2026-11-17';const view=adapt(snapshot);
    // Keep decided reviews available in the existing form so persisted answers remain visible.
    const all=adapt({...snapshot,reviews:snapshot.reviews.map(r=>r.status==='decided'?{...r,status:'open'}:r)});
    return json(200,{...view,reviews:all.reviews,decisions:snapshot.reviews.filter(r=>r.status==='decided'),taskStates:snapshot.tasks.map(t=>({id:t.task_id,status:t.status,version:t.version}))});
   }
   if(req.method==='GET'&&url.pathname==='/api/recovery')return json(200,recoveryRequests(s));
   if(req.method==='POST'&&/^\/api\/recovery\/[A-Za-z0-9:_-]+$/.test(url.pathname)){
    const id=url.pathname.slice('/api/recovery/'.length),run=s.get('runs',id);if(!run?.request)return json(404,{error:'request not found'});
    const result=recoverDecision(s,w,id);if(result.state!=='complete')return json(409,{error:'save failed',state:result.state});return json(200,result);
   }
   if(req.method==='POST'&&url.pathname==='/api/decision'){

    if(req.headers['content-type']!=='application/json')return json(415,{error:'json required'});
    let body='';for await(const part of req){body+=part;if(body.length>8192)return json(413,{error:'too large'});}
    const input=JSON.parse(body);if(!['완료','진행 중'].includes(input.answer)||typeof input.change_id!=='string'||!/^[A-Za-z0-9][A-Za-z0-9:_-]{0,127}$/.test(input.change_id)||typeof input.review_id!=='string'||!/^[A-Za-z0-9][A-Za-z0-9:_-]{0,127}$/.test(input.review_id)||!Number.isSafeInteger(input.expected_version)||input.expected_version<1||input.expected_version>2147483647)return json(400,{error:'invalid decision'});
    return json(200,decide(s,w,input));
   }
   if(req.method!=='GET')return json(405,{error:'method'});
   const relative=decodeURIComponent(url.pathname).replace(/^\//,'')||'index.html';
   if(!/^(index\.html|app\.js|data\.js|styles\.css|src\/model\.js|assets\/[\w-]+\.png)$/.test(relative))return json(404,{error:'not found'});
   const f=path.join(__dirname,'..',relative);res.writeHead(200,{'Content-Type':relative.endsWith('.html')?'text/html; charset=utf-8':relative.endsWith('.js')?'text/javascript; charset=utf-8':relative.endsWith('.css')?'text/css':'image/png'});res.end(fs.readFileSync(f));
  }catch(error){json(409,{error:error.message});}
 });
 return {server,s,w};
}
if(require.main===module){const {server}=createServer({reset:process.argv.includes('--reset')});server.listen(8766,'127.0.0.1',()=>console.log('Local synthetic PoC: http://127.0.0.1:8766/?data=local'));}
module.exports={createServer};
