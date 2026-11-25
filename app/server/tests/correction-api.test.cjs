const {test}=require('node:test');const a=require('node:assert/strict');const fs=require('node:fs');const os=require('node:os');const path=require('node:path');
const {createServer}=require('../node/server.cjs');
test('Node correction API persists full human history, rejects Origin, conflicts and raw fields',async t=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'ax-correction-'));const {server}=createServer({dir,seedMode:'small',env:{AUTH_MODE:'off',DEFAULT_USER_ID:'login-user'}});
 await new Promise(r=>server.listen(0,'127.0.0.1',r));t.after(async()=>{await new Promise(r=>server.close(r));fs.rmSync(dir,{recursive:true,force:true});});
 const base='http://127.0.0.1:'+server.address().port;
 const input={entity:'task',op:'update',id:'TSK-LOCAL',version:1,fields:{title:'changed'}};
 const post=(v,origin=base)=>fetch(base+'/api/correction',{method:'POST',headers:{'Content-Type':'application/json',Origin:origin},body:JSON.stringify(v)});
 a.equal((await post(input,'https://foreign.invalid')).status,403);
 a.equal((await post({...input,fields:{body:'raw'}})).status,400);
 const r=await post(input);a.equal(r.status,200);a.equal((await r.json()).version,2);
 a.equal((await post(input)).status,409);
 const d=JSON.parse(fs.readFileSync(path.join(dir,'corrected-dataset.json')));a.equal(d.history[0].actor_id,'login-user');a.equal(d.history[0].before.title,'로컬 저장 검증');a.equal(d.history[0].after.title,'changed');
 const view=await (await fetch(base+'/api/view')).json();a.equal(view.projects[0].tasks[0].title,'changed');a.equal(view.correctionData.tasks[0].version,2);
});
