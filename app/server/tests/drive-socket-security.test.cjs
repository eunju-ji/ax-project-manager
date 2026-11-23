const {test}=require('node:test'),a=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path'),net=require('node:net');
test('OAuth real socket malformed URL and simultaneous duplicate callbacks exchange once',async t=>{
 const {OAuth,SCOPES}=require('../connectors/drive/oauth.cjs');const dir=fs.mkdtempSync(path.join(os.tmpdir(),'ax-socket-'));t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));let exchanges=0;const oauth=new OAuth(dir,{timeoutMs:3000,fetchImpl:async()=>{exchanges++;return new Response(JSON.stringify({scope:SCOPES.join(' '),refresh_token:'fake',access_token:'fake',expires_in:3600}));}});oauth.client=()=>({client_id:'fake',client_secret:'fake'});
 await oauth.auth(async url=>{const u=new URL(url),cb=new URL(u.searchParams.get('redirect_uri'));
  const raw=(socket,target)=>new Promise((resolve,reject)=>{let response='';socket.on('data',d=>response+=d);socket.on('end',()=>resolve(response));socket.on('error',reject);socket.write(`GET ${target} HTTP/1.1\r\nHost: ${cb.host}\r\nConnection: close\r\n\r\n`);});
  const connect=()=>new Promise((resolve,reject)=>{const socket=net.connect(Number(cb.port),'127.0.0.1',()=>resolve(socket));socket.on('error',reject);});
  a.match(await raw(await connect(),'http://['),/^HTTP\/1.1 400/);
  const sockets=await Promise.all([connect(),connect()]);const target='/callback?'+new URLSearchParams({state:u.searchParams.get('state'),code:'fake'});const replies=await Promise.all(sockets.map(socket=>raw(socket,target)));a.deepEqual(replies.map(r=>Number(r.match(/^HTTP\/1.1 (\d+)/)[1])).sort(),[200,400]);
 });a.equal(exchanges,1);
});
test('pilot-decision real HTTP normal correction, invalid/missing task and masked errors',async t=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'ax-api-'));const {open}=require('../repo/sqlite/index.cjs'),{DriveStore}=require('../connectors/drive/store.cjs'),{add,content}=require('../repo/sqlite/records.cjs');const db=open(':memory:');t.after(()=>db.close());const store=new DriveStore(db,'D');
 db.tx(tx=>{const project=add(tx,'projects','PROJECT');add(tx,'tasks','TASK_1',{project_id:project,status:'in_progress',category:'검증'});const source=add(tx,'sources','drive:D:F',{availability:'available'},{service:'drive',account_scope:'D',file_id:'F'});add(tx,'source_events','EVENT',{source_id:source,event_key:'EVENT',payload_digest:'fake',key_version:1,collected_at:new Date().toISOString()});add(tx,'reviews','REVIEW',{kind:'link',status:'open',content_id:content(tx,{})},{pilot:true,event_key:'EVENT'});});
 const {server}=require('../api/server.cjs').createServer({dir,seedMode:'none',pilotProvider:()=>store});await new Promise(r=>server.listen(0,'127.0.0.1',r));t.after(async()=>{server.closeAllConnections?.();await new Promise(r=>server.close(r));fs.rmSync(dir,{recursive:true,force:true});});const url=`http://127.0.0.1:${server.address().port}/api/pilot-decision`;
 const post=async body=>{const response=await fetch(url,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({answer:'corrected',change_id:'change',review_id:'REVIEW',expected_version:1,...body})});return [response.status,await response.json()];};
 for(const task_id of ['TASK 1','A:B','A'.repeat(65),null])a.deepEqual(await post({task_id}),[400,{error:'invalid_task_id'}]);
 a.deepEqual(await post({task_id:'MISSING',change_id:'missing'}),[409,{error:'pilot_decision_failed'}]);
 a.deepEqual(await post({task_id:'TASK_1'}),[200,{state:'complete'}]);
 t.mock.method(store,'decideProposal',async()=>{throw Error('secret token or SQL details');});a.deepEqual(await post({task_id:'TASK_1',change_id:'fault'}),[409,{error:'pilot_decision_failed'}]);
});
