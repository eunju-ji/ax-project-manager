const {test}=require('node:test');
const assert=require('node:assert/strict');
const M=require('../src/model.js');
test('people include task-only owners and rank by worklog count then name',()=>{
 const rows=[{tasks:[{owner:'다',subtasks:[{owner:'나'},{owner:'가'},{owner:'나'}]}]}];
 assert.deepEqual(M.owners(rows),['나','가','다']);
});
test('progress uses completed tasks, clamps schedule and handles missing deadlines',()=>{
 const p={tasks:[{status:'completed',createdAt:'2026-11-01',dueDate:'2026-11-11'},{createdAt:'2026-11-02'}]};
 assert.deepEqual(M.progress(p,'2026-11-07'),{percent:50,schedule:60,behind:true});
 assert.equal(M.progress(p,'2026-12-01').schedule,100);
 assert.equal(M.progress(p,'2026-10-01').schedule,0);
 assert.deepEqual(M.progress({tasks:[]},'2026-11-01'),{percent:0,schedule:null,behind:false});
 assert.equal(M.progress({tasks:[{createdAt:'2026-11-01'}]},'2026-11-02').schedule,null);
 assert.equal(M.progress({tasks:[{createdAt:'2026-11-01',dueDate:'2026-11-01'}]},'2026-11-01').schedule,100);
});
test('deadline urgency excludes completed tasks and includes today through three days',()=>{
 assert.equal(M.deadline({dueDate:'2026-11-16'},'2026-11-17'),'late');
 assert.equal(M.deadline({dueDate:'2026-11-20'},'2026-11-17'),'soon');
 assert.equal(M.deadline({dueDate:'2026-11-21'},'2026-11-17'),'');
 assert.equal(M.deadline({dueDate:'2026-11-16',status:'completed'},'2026-11-17'),'');
});
test('summary periods cross month and year boundaries',()=>{
 assert.deepEqual(M.summaryRange('2026-01-01','day',-1),{start:'2025-12-31',end:'2025-12-31'});
 assert.deepEqual(M.summaryRange('2026-01-01','month',-1),{start:'2025-12-01',end:'2025-12-31'});
});
test('adapter forwards optional due date and completed state without inventing defaults',()=>{
 const data=structuredClone(require('./fixtures/ops-synthetic.json'));
 data.tasks[0].due_date='2026-11-20';data.tasks[0].status='completed';
 const tasks=require('../src/adapter.js').adapt(data).projects.flatMap(p=>p.tasks);
 const task=tasks.find(t=>t.id===data.tasks[0].task_id);
 assert.equal(task.dueDate,'2026-11-20');assert.equal(task.status,'completed');
 assert.ok(tasks.filter(t=>t.id!==task.id).every(t=>t.dueDate===undefined));
});
test('adapter forwards folder metadata and filters unsafe folder URLs',()=>{
 const data=structuredClone(require('./fixtures/ops-synthetic.json'));
 data.sources.forEach(s=>Object.assign(s,{folder_id:'drive-folder:test',folder_path:['AX_TF','합성 자료'],folder_uri:'https://drive.google.com/drive/folders/test'}));
 const files=require('../src/adapter.js').adapt(data).projects.flatMap(p=>p.files);
 assert.ok(files.length);for(const f of files){assert.equal(f.folderId,'drive-folder:test');assert.deepEqual(f.folderPath,['AX_TF','합성 자료']);assert.equal(f.folderUrl,'https://drive.google.com/drive/folders/test');}
 for(const uri of ['javascript:alert(1)','http://drive.google.com/test','https://untrusted.invalid/test','']){
  data.sources.forEach(s=>s.folder_uri=uri);
  assert.ok(require('../src/adapter.js').adapt(data).projects.flatMap(p=>p.files).every(f=>!f.folderUrl));
 }
});
