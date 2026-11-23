const {test}=require('node:test');
const a=require('node:assert/strict');
const {open}=require('../repo/sqlite/index.cjs');
const {row,WORKSPACE:ws}=require('../repo/sqlite/records.cjs');
const {DriveStore}=require('../connectors/drive/store.cjs');
const c=require('../connectors/drive/classify.cjs');
function fixture(t){const db=open(':memory:');t.after(()=>db.close());const store=new DriveStore(db,'D');db.tx(tx=>store.preparePage(tx,{change_id:'seed',files:[{id:'F',driveId:'D',name:'$(throw Error()); <script>bad</script>',mimeType:'text/plain',parents:['D'],webViewLink:'https://secret.invalid',token:'SECRET'}]}));const input=c.extract(store);return {db,store,input};}
const basis={confidence:.95,evidence:{ids:['drive:D:F'],summary:'파일 근거'}};
const project=()=>({op:'create_project',temp_key:'P',name:'프로젝트',purpose:'목적',...basis});
const task=()=>({op:'create_task',temp_key:'T',project_ref:'P',title:'작업',category:'검증',...basis});
const result=(input,operations)=>({format:'ax-classify-result',version:1,input_id:input.input_id,operations});
test('high confidence creates and links; dry run is read only; revert preserves later human edit',t=>{
 const {db,store,input}=fixture(t);const r=result(input,[project(),task(),{op:'link',target:{type:'task',id:'T'},source_ref:{type:'source',id:'drive:D:F'},role:'산출물',...basis}]);
 a.equal(c.apply(store,r,{dryRun:true}).automatic,3);a.equal(db.tx(tx=>tx.get('SELECT count(*) n FROM projects').n),0);
 const applied=c.apply(store,r);a.equal(applied.automatic,3);a.equal(store.view().projects.length,1);
 db.tx(tx=>store.change(tx,'tasks',row(tx,'tasks',applied.refs.T),{category:'운영·지원'},{change_id:'human'},'local-pilot-user','task correction'));
 const undone=c.revert(store,applied.result_id);a.ok(undone.conflicts.length);a.equal(db.tx(tx=>row(tx,'tasks',applied.refs.T).category),'운영·지원');
});
test('low confidence, invalid evidence and conflicting operations go to review; schema fails closed',t=>{
 const {db,store,input}=fixture(t);
 const r=result(input,[{...project(),confidence:.2},{...project(),temp_key:'Q',evidence:{ids:['missing'],summary:'bad'}},{...project(),temp_key:'X'},{...project(),temp_key:'X',name:'다른 결론'}]);
 a.equal(c.apply(store,r).review,4);a.equal(db.tx(tx=>tx.get('SELECT count(*) n FROM projects').n),0);
 a.throws(()=>c.apply(store,result(input,[{...project(),script:'alert(1)'}])),/field/);
 a.throws(()=>c.apply(store,{...r,input_id:'other'}),/input/);
});
test('human decision and completion attempts blocked; injected transaction failure rolls everything back',t=>{
 const {db,store,input}=fixture(t);const first=c.apply(store,result(input,[project(),task()]));
 db.tx(tx=>store.change(tx,'tasks',row(tx,'tasks',first.refs.T),{category:'조사·분석'},{change_id:'human'},'local-pilot-user','human task edit'));
 const next=c.extract(store);a.equal(c.apply(store,result(next,[{op:'set_category',task_ref:first.refs.T,category:'검증',reason:'분류',...basis},{op:'set_status',task_ref:first.refs.T,status:'completed',...basis}])).review,2);
 const before=db.tx(tx=>JSON.stringify(tx.all('SELECT * FROM projects')));store.fault='audit';a.throws(()=>c.apply(store,result(c.extract(store),[{...project(),temp_key:'NEW'}])),/injected/);store.fault=null;a.equal(db.tx(tx=>JSON.stringify(tx.all('SELECT * FROM projects'))),before);
});
test('extract minimizes metadata and hides inaccessible ancestors and historical paths',t=>{
 const {db,store}=fixture(t);db.tx(tx=>{store.preparePage(tx,{change_id:'seed2',files:[{id:'H',name:'HIDDEN',driveId:'D',parents:['D']},{id:'F',name:'file',driveId:'D',parents:['H'],folderPath:'HIDDEN/OLD',token:'SECRET',url:'https://secret.invalid'}]});tx.run("UPDATE sources SET availability='access_denied' WHERE display_key='drive:D:H'");});
 const json=JSON.stringify(c.extract(store));a.ok(!json.includes('HIDDEN'));a.ok(!json.includes('SECRET'));a.ok(!json.includes('https://'));a.ok(json.includes('접근 불가'));
});
test('worklog, relink, unlink, rename and revert form an atomic reversible result',t=>{
 const {db,store,input}=fixture(t);const applied=c.apply(store,result(input,[project(),task(),{op:'create_worklog',temp_key:'W',task_ref:'T',performer_person_id:'unknown',performed_on:'2026-11-01',title:'기록',summary:'<script>throw Error()</script>',source_refs:[{type:'source',id:'drive:D:F'}],...basis}]));
 a.equal(applied.automatic,3);a.equal(store.view().projects[0].tasks[0].subtasks.length,1);a.equal(store.view().projects[0].tasks[0].topic,'검증');
 const fresh=c.extract(store);const renamed=c.apply(store,result(fresh,[{op:'rename',target:{type:'task',id:applied.refs.T},name:'새 이름',reason:'명확화',...basis}]));a.equal(renamed.automatic,1);a.equal(store.view().projects[0].tasks[0].title,'새 이름');a.equal(c.revert(store,renamed.result_id).conflicts.length,0);
 const link=db.tx(tx=>tx.get('SELECT * FROM links LIMIT 1'));const unlinked=c.apply(store,result(c.extract(store),[{op:'unlink',link_id:link.id,reason:'중복',...basis}]));a.equal(unlinked.automatic,1);a.equal(db.tx(tx=>row(tx,'links',link.id).status),'rejected');a.equal(c.revert(store,unlinked.result_id).conflicts.length,0);
 // Use a fresh independent bundle to verify full deletion in foreign-key order.
 const second=c.apply(store,result(c.extract(store),[{...project(),temp_key:'P2'},{...task(),temp_key:'T2',project_ref:'P2'}]));a.equal(c.revert(store,second.result_id).reverted.length,2);
 a.equal(store.metrics().auto_classify.automatic_applied,7);
});
test('merge and split move all children, hide old tasks, and revert restores them',t=>{
 const {db,store,input}=fixture(t);const r=c.apply(store,result(input,[project(),task(),{...task(),temp_key:'T2',title:'작업2'}]));
 const merged=c.apply(store,result(c.extract(store),[{op:'merge_tasks',task_refs:[r.refs.T],into_task_ref:r.refs.T2,reason:'동일 업무',...basis}]));a.equal(merged.automatic,1);a.equal(store.view().projects[0].tasks.length,1);a.equal(c.revert(store,merged.result_id).conflicts.length,0);a.equal(store.view().projects[0].tasks.length,2);
 const split=c.apply(store,result(c.extract(store),[{op:'split_task',task_ref:r.refs.T,parts:[{temp_key:'A',title:'분리1',category:'검증',worklog_ids:[],link_ids:[]},{temp_key:'B',title:'분리2',category:'검증',worklog_ids:[],link_ids:[]}],reason:'별개 산출물',...basis}]));a.equal(split.automatic,1);a.equal(store.view().projects[0].tasks.length,3);a.equal(c.revert(store,split.result_id).conflicts.length,0);a.equal(store.view().projects[0].tasks.length,2);
});
test('protected file boundary rejects traversal, extension, size and malformed UTF-8; batches carry instructions',t=>{
 const fs=require('node:fs'),os=require('node:os'),path=require('node:path'),security=require('../connectors/drive/security.cjs'),files=require('../connectors/drive/classify-files.cjs');
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'ax-classify-')),oldRoot=security.PILOT_DIR,oldCheck=security.checkDirs;
 // Synthetic-only directory; production ACL enforcement remains exercised by existing security tests.
 security.PILOT_DIR=root;security.checkDirs=()=>{};t.after(()=>{security.PILOT_DIR=oldRoot;security.checkDirs=oldCheck;fs.rmSync(root,{recursive:true,force:true});});
 const {store}=fixture(t);const output=files.write(store);a.equal(files.read(output.files[0]).input_id,output.input_id);
 const dir=path.join(root,'classify');fs.writeFileSync(path.join(dir,'bad.json'),Buffer.from([0xff]));a.throws(()=>files.read(path.join(dir,'bad.json')),/encoded|encoding/i);
 fs.writeFileSync(path.join(root,'outside.json'),'{}');a.throws(()=>files.read(path.join(root,'outside.json')),/classify/);
 fs.writeFileSync(path.join(dir,'bad.txt'),'{}');a.throws(()=>files.read(path.join(dir,'bad.txt')),/classify/);
 fs.writeFileSync(path.join(dir,'large.json'),Buffer.alloc(files.LIMIT+1));a.throws(()=>files.read(path.join(dir,'large.json')),/large/);
 store.db.tx(tx=>store.preparePage(tx,{change_id:'many',files:Array.from({length:6},(_,i)=>({id:'B'+i,driveId:'D',name:'합성'.repeat(2000),parents:['D']}))}));const batches=files.write(store,{maxBytes:20000});a.ok(batches.files.length>1);a.ok(batches.manifest);for(const file of batches.files){const batch=files.read(file);a.equal(batch.input_id,batches.input_id);a.equal(batch.instructions.format,'ax-classify-result');}
});
test('model uncertainty, relinking and later source suppression remain reviewable',t=>{
 const {db,store,input}=fixture(t),r=c.apply(store,result(input,[project(),task(),{...task(),temp_key:'T2'}]));
 const linked=c.apply(store,result(c.extract(store),[{op:'link',target:{type:'task',id:r.refs.T},source_ref:{type:'source',id:'drive:D:F'},role:'산출물',...basis}]));a.equal(linked.automatic,1);
 const l=db.tx(tx=>tx.get('SELECT * FROM links LIMIT 1'));const moved=c.apply(store,result(c.extract(store),[{op:'relink',link_id:l.id,target:{type:'task',id:r.refs.T2},reason:'정확한 대상',...basis}]));a.equal(moved.automatic,1);a.equal(db.tx(tx=>row(tx,'links',l.id).task_id),r.refs.T2);
 const uncertain=c.apply(store,result(c.extract(store),[{op:'needs_review',target:{type:'task',id:r.refs.T},question:'프로젝트가 맞습니까?',candidates:[r.refs.T,r.refs.T2],reason:'근거 충돌',...basis}]));a.equal(uncertain.review,1);a.equal(store.view().pilotReviews.length,1);
 a.ok(c.extract(store).previous_results.length);a.ok(store.metrics().auto_classify.review_reasons.model_uncertain);
});
