const {test}=require('node:test');
const assert=require('node:assert/strict');
const M=require('../src/model.js');
test('people include task-only owners and rank by worklog count then name',()=>{
 const rows=[{tasks:[{owner:'다',subtasks:[{owner:'나'},{owner:'가'},{owner:'나'}]}]}];
 assert.deepEqual(M.owners(rows),['나','가','다']);
});
test('progress counts only WBS tasks and dated plan deadlines',()=>{
 const p={tasks:[{planSource:'wbs',status:'completed',dueDate:'2026-11-07'},{planSource:'wbs',dueDate:'2026-11-08'},{planSource:'wbs'},{status:'completed'}]};
 assert.deepEqual(M.progress(p,'2026-11-07'),{percent:33,schedule:0,behind:false,planned:true,done:1,total:3,unverified:0});
 assert.equal(M.progress(p,'2026-11-08').schedule,50);
 assert.equal(M.progress(p,'2026-11-06').schedule,0);
 assert.deepEqual(M.progress({tasks:[]},'2026-11-01'),{percent:0,schedule:null,behind:false,planned:false,done:0,total:0,unverified:0});
 assert.deepEqual(M.progress({tasks:[{status:'completed'},{}]},'2026-11-01'),{percent:50,schedule:null,behind:false,planned:false,done:1,total:2,unverified:0});
 assert.equal(M.progress({tasks:[{planSource:'wbs'}]},'2026-11-01').schedule,null);
});
test('taskState uses completion, overdue and start boundaries',()=>{
 const now='2026-11-20';
 for(const [task,state] of [[{status:'completed',dueDate:'2026-11-01'},'completed'],[{dueDate:'2026-11-19',subtasks:[{}]},'late'],[{dueDate:'2026-11-19',subtasks:[]},'unverified'],[{dueDate:now},'active'],[{startDate:now},'active'],[{startDate:'2026-11-21'},'upcoming'],[{},'undated']])assert.equal(M.taskState(task,now),state);
});

test('deadline urgency excludes completed tasks and includes today through three days',()=>{
 assert.equal(M.deadline({dueDate:'2026-11-16',subtasks:[{}]},'2026-11-17'),'late');
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

test('adapter forwards WBS plan metadata and defaults activity source',()=>{
 const data=structuredClone(require('./fixtures/ops-synthetic.json'));
 Object.assign(data.tasks[0],{wbs_code:'1.1.1',start_date:'2026-11-01',plan_source:'wbs'});
 const tasks=require('../src/adapter.js').adapt(data).projects.flatMap(p=>p.tasks),t=tasks.find(t=>t.id===data.tasks[0].task_id);
 assert.equal(t.wbsCode,'1.1.1');assert.equal(t.startDate,'2026-11-01');assert.equal(t.planSource,'wbs');assert.ok(tasks.filter(x=>x!==t).every(x=>x.planSource==='activity'));
});

test('unverified tasks are excluded only from delay calculations',()=>{
 const task=(status,dueDate,subtasks=[])=>({planSource:'wbs',status,dueDate,subtasks});
 const done=task('completed','2026-11-01'),unknown=task('in_progress','2026-11-02'),future=task('in_progress','2026-12-01');
 assert.deepEqual(M.progress({tasks:[done,unknown,future]},'2026-11-20'),{percent:33,schedule:50,behind:false,planned:true,done:1,total:3,unverified:1});
 assert.equal(M.progress({tasks:[done,unknown,task('in_progress','2026-11-03',[{}]),future]},'2026-11-20').behind,true);
 assert.deepEqual(M.progress({tasks:[unknown]},'2026-11-20'),{percent:0,schedule:null,behind:false,planned:true,done:0,total:1,unverified:1});
 assert.equal(M.progress({tasks:[{...unknown,planSource:'activity'}]},'2026-11-20').schedule,null);
 assert.equal(M.deadline(unknown,'2026-11-20'),'unverified');
 assert.equal(M.taskState({...unknown,status:'completed'},'2026-11-20'),'completed');
 assert.equal(M.taskState({...unknown,dueDate:'2026-11-20'},'2026-11-20'),'active');
});
