const test=require('node:test');const a=require('node:assert/strict');const fs=require('node:fs');const os=require('node:os');const path=require('node:path');
const {createServer}=require('../api/server.cjs');const {adapt}=require('../../src/adapter.js');
const run='RUN-R';
const data={persons:[{person_id:'P1',display_name:'사람1',external_ids:[]}],projects:[{project_id:'p',name:'실데이터 프로젝트',owner_id:'P1',created_at:'2026-11-01',version:1,approved_scopes:[]}],
 tasks:[{task_id:'T-1',project_id:'p',title:'교차 소스 태스크',category:'검증',assignee_id:'P1',summary:'',created_at:'2026-11-01T09:00:00+09:00',status:'in_progress',version:1}],
 worklogs:['drive:f1','chat-file:m1:1','gmail-att:g1:1'].map((s,i)=>({worklog_id:'W'+i,task_id:'T-1',performer_id:'P1',performer_basis:'작성 내역 확인',performed_at:'2026-11-0'+(i+2)+'T01:00:00Z',performed_at_precision:'exact',title:'기록 '+i,summary:'요약 '+i,summary_origin:'system',origin:'suggested',run_id:run,created_run_id:run,version:1})),
 sources:['drive:f1','chat-file:m1:1','gmail-att:g1:1'].map(k=>({source_key:k,title:k,kind:'document',uri:'https://example.invalid/'+k,availability:'available',created_at:'2026-11-02T00:00:00Z',version:1,run_id:run,original_project:'p'})),
 links:['drive:f1','chat-file:m1:1','gmail-att:g1:1'].map((k,i)=>({link_id:'L'+i,target_type:'worklog',target_id:'W'+i,evidence_type:'source',evidence_key:k,status:'confirmed',role:'산출물',basis:'t',decided_by:'P1',decided_at:'2026-11-19T00:00:00Z',version:1,run_id:run})),
 runs:[{run_id:run,state:'complete',trigger:'test',manifest:[],recoveries:0}],externalAccounts:[],sourceEvents:[],reviews:[]};
test('adapter labels Chat and Gmail attachments separately from Drive',()=>{
 const files=adapt(data).projects[0].files;a.deepEqual(files.map(f=>[f.id,f.source]),[['chat-file:m1:1','Google Chat'],['drive:f1','Google Drive'],['gmail-att:g1:1','Gmail']]);
});
test('message and mail bodies are evidence only, never 자료',()=>{
 const d=structuredClone(data);
 d.sources.push({source_key:'chat:m9',title:'채팅 메시지',kind:'message',uri:'https://chat.google.com/room/x/m9/m9',availability:'available',created_at:'2026-11-02T00:00:00Z',version:1,run_id:run,original_project:'p'},{source_key:'gmail:g9',title:'메일 본문',kind:'message',uri:'https://mail.google.com/mail/u/0/#all/g9',availability:'available',created_at:'2026-11-02T00:00:00Z',version:1,run_id:run,original_project:'p'});
 d.worklogs.push({...d.worklogs[0],worklog_id:'W9',title:'메시지만 있는 기록'});
 d.links.push({...d.links[0],link_id:'L9',target_id:'W9',evidence_key:'chat:m9',role:'참고'},{...d.links[0],link_id:'L10',target_id:'W9',evidence_key:'gmail:g9',role:'참고'});
 const p=adapt(d).projects[0];
 a.ok(p.files.every(f=>!['chat:m9','gmail:g9'].includes(f.id)));a.equal(p.files.length,3);
 const w9=p.tasks[0].subtasks.find(s=>s.id==='W9');a.ok(w9,'work log itself stays');a.equal(w9.artifact,'');a.equal(w9.sourceId,undefined);
});
test('real mode serves the prepared dataset and keeps default view unchanged',async t=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'ax-real-'));const file=path.join(dir,'real-dataset.json');fs.writeFileSync(file,JSON.stringify(data));
 const {server}=createServer({dir,seedMode:'small',realDatasetFile:file});await new Promise(r=>server.listen(0,'127.0.0.1',r));
 t.after(()=>new Promise(r=>server.close(()=>{fs.rmSync(dir,{recursive:true,force:true});r();})));
 const base=`http://127.0.0.1:${server.address().port}`;
 const real=await (await fetch(base+'/api/view?data=real')).json();
 a.equal(real.projects.length,1);a.equal(real.projects[0].tasks[0].subtasks.length,3);
 a.deepEqual([...new Set(real.projects[0].files.map(f=>f.source))].sort(),['Gmail','Google Chat','Google Drive']);
 const local=await (await fetch(base+'/api/view')).json();a.ok(local.projects.every(p=>p.id!=='p'));
});
test('real mode fails closed when no dataset is prepared',async t=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'ax-real-none-'));const {server}=createServer({dir,seedMode:'small',realDatasetFile:path.join(dir,'missing.json')});await new Promise(r=>server.listen(0,'127.0.0.1',r));
 t.after(()=>new Promise(r=>server.close(()=>{fs.rmSync(dir,{recursive:true,force:true});r();})));
 const res=await fetch(`http://127.0.0.1:${server.address().port}/api/view?data=real`);a.equal(res.status,500);a.deepEqual(await res.json(),{error:'request_failed'});
});
test('adapter exposes only https links on original-service hosts',()=>{
 const d=structuredClone(data);const uri={'drive:f1':'https://drive.google.com/open?id=f1','chat-file:m1:1':'javascript:alert(1)','gmail-att:g1:1':'http://mail.google.com/x'};
 for(const s of d.sources)s.uri=uri[s.source_key];
 const files=Object.fromEntries(adapt(d).projects[0].files.map(f=>[f.id,f.url]));
 a.equal(files['drive:f1'],'https://drive.google.com/open?id=f1');a.equal(files['chat-file:m1:1'],undefined);a.equal(files['gmail-att:g1:1'],undefined);
 a.ok(adapt(data).projects[0].files.every(f=>!('url' in f)),'example.invalid links stay hidden');
});
test('real mode returns the dataset as-of date and notice so the UI does not fall back to example wording',async t=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'ax-real-meta-'));const file=path.join(dir,'real-dataset.json');fs.writeFileSync(file,JSON.stringify({...data,demoAsOf:'2026-11-19',demoNotice:'실데이터 안내'}));
 const {server}=createServer({dir,seedMode:'small',realDatasetFile:file});await new Promise(r=>server.listen(0,'127.0.0.1',r));
 t.after(()=>new Promise(r=>server.close(()=>{fs.rmSync(dir,{recursive:true,force:true});r();})));
 const v=await (await fetch(`http://127.0.0.1:${server.address().port}/api/view?data=real`)).json();
 a.equal(v.demoAsOf,new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Seoul'}).format(new Date()),'as-of is today in Korea');a.equal(v.collectedOn,'2026-11-19');a.equal(v.demoNotice,'실데이터 안내');
});
