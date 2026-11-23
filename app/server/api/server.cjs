const http=require('node:http');const fs=require('node:fs');const path=require('node:path');
const {open}=require('../repo/sqlite/index.cjs');const {seed}=require('../repo/sqlite/records.cjs');const {Service}=require('../service/index.cjs');
function small(){return {persons:[{person_id:'P1',display_name:'김지현'}],projects:[{project_id:'PRJ-LOCAL',name:'로컬 합성 PoC',owner_id:'P1'}],tasks:[{task_id:'TSK-LOCAL',project_id:'PRJ-LOCAL',assignee_id:'P1',status:'in_progress',title:'로컬 저장 검증',category:'검증',created_at:'2026-11-17T00:00:00.000Z'}],reviews:[1,2].map(n=>({review_id:'RV-'+n,kind:'completion',subject_id:'TSK-LOCAL',subject_type:'task',status:'open',proposal:'합성 완료 제안 '+n}))};}
function createServer({dir=path.join(__dirname,'../.runtime'),seedMode='large',reset=false,pilotProvider,realDatasetFile}={}){
 fs.mkdirSync(dir,{recursive:true});const file=path.join(path.resolve(dir),'local.sqlite');
 // Preserve existing DB on reset; never move an arbitrary caller directory.
 const data=seedMode==='small'?small():require('../../poc/dataset/synthetic-large.json');
 const seeds=require('../repo/sqlite/seed-file.cjs');if(seedMode!=='none')seeds.prepare(file,data,reset);
 const db=open(file);if(seedMode!=='none'){seed(db,data);seeds.mark(db,data);}
 const service=new Service(db);
 const pilotFile=require('../connectors/drive/cli.cjs').PILOT_FILE;let pilotDb,pilotService;
 // Real-data mode: dataset judged by AX-Lead from GWS digests (ADR-017). Lives only in the Git-ignored, owner-only server/.real directory.
 const realDataset=realDatasetFile||path.join(__dirname,'../.real/real-dataset.json');let realDb,realService,realMeta={},realDigest;
 function real(){
  if(!fs.existsSync(realDataset))throw Error('Real dataset not prepared');
  const bytes=fs.readFileSync(realDataset);const digest=require('node:crypto').createHash('sha256').update(bytes).digest('hex');
  if(!realService||digest!==realDigest){
   const data=JSON.parse(bytes);const rf=path.join(path.dirname(realDataset),'real.sqlite');
   // Release this runtime's SQLite lease/handles before prepare may rename the DB on Windows.
   realDb?.close();realDb=undefined;realService=undefined;
   seeds.prepare(rf,data,false);
   const next=open(rf);
   try{seed(next,data);seeds.mark(next,data);realService=new Service(next);realDb=next;realDigest=digest;realMeta={collectedOn:String(data.demoAsOf||''),demoNotice:String(data.demoNotice||'')};}
   catch(error){next.close();throw error;}
  }
  return realService;
 }
 function pilot(){if(pilotProvider)return pilotProvider();if(!fs.existsSync(pilotFile))throw Error('Pilot database not collected');if(!pilotDb){pilotDb=open(pilotFile);pilotService=new (require('../connectors/drive/store.cjs').DriveStore)(pilotDb,process.env.AX_DRIVE_ID||'unconfigured');}return pilotService;}
 const server=http.createServer(async(req,res)=>{
  const json=(code,data)=>{res.writeHead(code,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'});res.end(JSON.stringify(data));};
  try{
   const host=req.headers.host;if(!/^127\.0\.0\.1:\d+$/.test(host||''))return json(403,{error:'host'});
   if(req.headers.origin&&req.headers.origin!==`http://${host}`)return json(403,{error:'origin'});
   const url=new URL(req.url,`http://${host}`);
   if(req.method==='GET'&&url.pathname==='/api/view'){const mode=url.searchParams.get('data');return json(200,mode==='pilot'?pilot().view():mode==='real'?{...real().view(),...realMeta,demoAsOf:new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Seoul'}).format(new Date())}:service.view());}
   if(req.method==='POST'&&url.pathname==='/api/pilot-decision'){
    if(req.headers['content-type']!=='application/json')return json(415,{error:'json required'});let body='';for await(const part of req){body+=part;if(Buffer.byteLength(body)>8192)return json(413,{error:'too large'});}let input;try{input=JSON.parse(body);}catch{return json(400,{error:'invalid json'});}
    if(!input||Object.keys(input).some(k=>!['answer','change_id','review_id','expected_version','task_id'].includes(k))||!['accepted','corrected','unable'].includes(input.answer)||!['change_id','review_id'].every(k=>typeof input[k]==='string'&&/^[A-Za-z0-9:_-]{1,128}$/.test(input[k]))||!Number.isSafeInteger(input.expected_version)||input.expected_version<1)return json(400,{error:'invalid decision'});
    if((input.answer==='corrected'||input.task_id!==undefined)&&(!require('../domain/display-key.cjs').validKey(input.task_id)))return json(400,{error:'invalid_task_id'});
    try{return json(200,await pilot().decideProposal(input));}catch{return json(409,{error:'pilot_decision_failed'});}
   }
   if(req.method==='POST'&&url.pathname==='/api/decision'){
    if(req.headers['content-type']!=='application/json')return json(415,{error:'json required'});
    let body='';for await(const part of req){body+=part;if(Buffer.byteLength(body)>8192)return json(413,{error:'too large'});}
    let input;try{input=JSON.parse(body);}catch{return json(400,{error:'invalid json'});}
    if(!input||Object.keys(input).some(k=>!['answer','change_id','review_id','expected_version'].includes(k))||!['완료','진행 중'].includes(input.answer)||!['change_id','review_id'].every(k=>typeof input[k]==='string'&&/^[A-Za-z0-9][A-Za-z0-9:_-]{0,127}$/.test(input[k]))||!Number.isSafeInteger(input.expected_version)||input.expected_version<1||input.expected_version>2147483647)return json(400,{error:'invalid decision'});
    const target=url.searchParams.get('data')==='real'?real():service;const result=await target.decide(input);if(target.fault==='response'){res.destroy();return;}return json(200,result);
   }
   if(req.method!=='GET')return json(405,{error:'method'});
   const relative=decodeURIComponent(url.pathname).replace(/^\//,'')||'index.html';
   if(!/^(index\.html|app\.js|data\.js|styles\.css|src\/model\.js|assets\/[\w-]+\.png)$/.test(relative))return json(404,{error:'not found'});
   const f=path.join(__dirname,'../..',relative);res.writeHead(200,{'Content-Type':relative.endsWith('.html')?'text/html; charset=utf-8':relative.endsWith('.js')?'text/javascript; charset=utf-8':relative.endsWith('.css')?'text/css':'image/png'});res.end(fs.readFileSync(f));
  }catch(error){json(error.code==='conflict'?409:500,{error:'request_failed'});}
 });
 server.on('close',()=>{db.close();pilotDb?.close();realDb?.close();});return {server,db,service};
}
if(require.main===module){const {server}=createServer({reset:process.argv.includes('--reset')});server.listen(8766,'127.0.0.1',()=>console.log('SQLite synthetic PoC: http://127.0.0.1:8766/?data=local  |  real data: http://127.0.0.1:8766/?data=real'));}
module.exports={createServer,small};
