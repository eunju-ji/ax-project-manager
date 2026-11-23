const {test}=require('node:test');
const a=require('node:assert/strict');
const {open}=require('../repo/sqlite/index.cjs');
const {row,add,hydrate,WORKSPACE:ws}=require('../repo/sqlite/records.cjs');
const {DriveStore}=require('../connectors/drive/store.cjs');
const {DriveCollector}=require('../connectors/drive/collect.cjs');
const {splitActivity}=require('../connectors/drive/model.cjs');
const structure=require('../connectors/drive/structure.cjs');
async function fixture(t){
 const db=open(':memory:');t.after(()=>db.close());const store=new DriveStore(db,'D');
 const folder=(id,name,parent)=>({id,name,parents:[parent],driveId:'D',mimeType:'application/vnd.google-apps.folder'});
 const files=[folder('P','한글 프로젝트','D'),folder('T','설계, 검토','P'),folder('N','하위','T'),{id:'F',driveId:'D',name:'문서',parents:['N'],lastModifyingUser:{permissionId:'1',emailAddress:'a@example.invalid'}},{id:'ROOT',driveId:'D',name:'미분류',parents:['D']}];
 const activity={primaryActionDetail:{edit:{}},actors:[{user:{knownUser:{personName:'people/1'}}}],targets:[{driveItem:{name:'items/F'}}],timestamp:'2026-11-01T00:00:00Z'};
 const client={driveId:'D',start:async()=>({startPageToken:'1'}),files:async()=>({files}),changes:async()=>({newStartPageToken:'2'}),file:async id=>files.find(f=>f.id===id),activities:async()=>({activities:[activity]})};
 await new DriveCollector(client,store).collect('2026-11-01');return {db,store,client};
}
test('empty pilot collects first; tree draft has BOM, Korean, descendant counts and unclassified files',async t=>{
 const {db,store}=await fixture(t);a.equal(db.tx(tx=>tx.get('SELECT count(*) n FROM tasks').n),0);
 const rows=structure.draft(store);a.equal(rows.length,4);const project=rows.find(r=>r.folder_id==='P');a.equal(project.project_name,'한글 프로젝트');a.equal(project.file_count,1);a.equal(project.active_people_count,1);a.equal(project.last_activity_at,'2026-11-01T00:00:00.000Z');
 a.equal(rows.find(r=>r.folder_id==='ROOT').project_name,'미분류');a.equal(rows.find(r=>r.folder_id==='ROOT').include,'N');
 const csv=structure.encode(rows);a.equal(Buffer.from(csv).subarray(0,3).toString('hex'),'efbbbf');a.deepEqual(structure.parse(csv).map(r=>r.task_name),rows.map(r=>r.task_name));
});
test('edited CSV imports keys, assignments, multiple folders, folderless task; rematch is idempotent and preserves judgments',async t=>{
 const {db,store}=await fixture(t);const rows=structure.draft(store);const p=rows.find(r=>r.folder_id==='P'),task=rows.find(r=>r.folder_id==='T');
 p.project_key='MY-P';p.project_name='확정 프로젝트';task.project_key='MY-P';task.project_name=p.project_name;task.task_key='MY-T';task.category='기획·설계';task.assignee_email='a@example.invalid';
 rows.find(r=>r.folder_id==='N').include='N';rows.push({...task,folder_id:'N'});rows.push({...task,task_key:'MANUAL',task_name:'수동 태스크',folder_id:'',assignee_email:'missing@example.invalid'});
 const csv=structure.encode(rows);const result=structure.importCsv(store,csv);a.ok(result.warnings.some(w=>w.includes('missing@example.invalid')));
 db.tx(tx=>{a.equal(tx.get('SELECT count(*) n FROM projects').n,1);a.equal(tx.get('SELECT count(*) n FROM tasks').n,2);a.ok(row(tx,'tasks','MY-T').assignee_id);a.equal(row(tx,'tasks','MANUAL').assignee_id,null);a.equal(tx.get('SELECT count(*) n FROM links').n,0);a.ok(tx.get("SELECT 1 FROM reviews WHERE task_id=? AND status='open'",row(tx,'tasks','MY-T').id));});
 const review=store.view().pilotReviews.find(r=>r.kind==='link'&&r.proposed_task_id);await store.decideProposal({change_id:'human',review_id:review.id,expected_version:review.version,answer:'accepted'});
 const before=db.tx(tx=>JSON.stringify(tx.all('SELECT * FROM links')));structure.importCsv(store,csv);structure.rematch(store);
 db.tx(tx=>{a.equal(JSON.stringify(tx.all('SELECT * FROM links')),before);a.equal(tx.get('SELECT count(*) n FROM tasks').n,2);a.ok(tx.get('SELECT count(*) n FROM change_log').n>0);});
});
test('CSV validation rejects category, missing columns, duplicate conflicting keys; import rollback is complete',async t=>{
 const {db,store}=await fixture(t);const rows=structure.draft(store).filter(r=>r.folder_id==='P'||r.folder_id==='T');rows[1].category='검증';
 a.throws(()=>structure.importCsv(store,'kind,include\nproject,Y'),/column/);
 a.throws(()=>structure.importCsv(store,structure.encode([...rows,{...rows[1],task_name:'conflict'}])),/duplicate/);
 a.throws(()=>structure.importCsv(store,structure.encode([rows[0],{...rows[1],category:'invalid'}])),/category/);
 const before=db.tx(tx=>JSON.stringify(tx.all('SELECT * FROM protected_contents')));store.fault='audit';a.throws(()=>structure.importCsv(store,structure.encode(rows)),/injected/);store.fault=null;
 db.tx(tx=>{a.equal(tx.get('SELECT count(*) n FROM projects').n,0);a.equal(tx.get('SELECT count(*) n FROM tasks').n,0);a.equal(JSON.stringify(tx.all('SELECT * FROM protected_contents')),before);});
 rows[1].folder_id='MISSING';a.ok(structure.importCsv(store,structure.encode(rows)).warnings.some(w=>w.includes('MISSING')));
});
test('removed without metadata becomes unknown; trash and restore preserve all evidence',async t=>{
 const {db,store,client}=await fixture(t);structure.importCsv(store,structure.encode(structure.draft(store).map(r=>({...r,category:r.kind==='task'?'검증':''}))));
 db.tx(tx=>{const task=tx.get('SELECT * FROM tasks LIMIT 1'),event=tx.get('SELECT * FROM source_events LIMIT 1');add(tx,'links','human',{task_id:task.id,source_event_id:event.id,status:'confirmed'});add(tx,'worklogs','log',{task_id:task.id,performer_state:'unknown',performed_at_precision:'unknown'});});
 const before=db.tx(tx=>['links','source_events','worklogs'].map(table=>JSON.stringify(tx.all(`SELECT * FROM ${table}`))));
 client.changes=async()=>({changes:[{removed:true,fileId:'F'},{removed:true,fileId:'NEVER'}],newStartPageToken:'3'});await new DriveCollector(client,store).changes();
 db.tx(tx=>{a.equal(row(tx,'sources','drive:D:F').availability,'unknown');a.ok(row(tx,'sources','drive:D:F').checked_at);a.equal(row(tx,'sources','drive:D:NEVER'),undefined);});
 client.changes=async()=>({changes:[{fileId:'F',file:{id:'F',driveId:'D',name:'문서',parents:['T'],trashed:true}}],newStartPageToken:'4'});await new DriveCollector(client,store).changes();a.equal(db.tx(tx=>row(tx,'sources','drive:D:F').availability),'trashed');
 client.changes=async()=>({changes:[{fileId:'F',file:{id:'F',driveId:'D',name:'문서',parents:['T'],trashed:false}}],newStartPageToken:'5'});await new DriveCollector(client,store).changes();
 db.tx(tx=>{a.equal(row(tx,'sources','drive:D:F').availability,'available');a.deepEqual(['links','source_events','worklogs'].map(table=>JSON.stringify(tx.all(`SELECT * FROM ${table}`))),before);});
});
