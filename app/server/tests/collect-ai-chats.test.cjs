const test=require('node:test'),a=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
test('AI collector indexes synthetic sessions and exports without bodies',t=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'ax-ai-'));t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));
 for(const sub of ['projects/work','projects/AppData-Local-Temp-demo','imports/claude','imports/chatgpt'])fs.mkdirSync(path.join(dir,sub),{recursive:true});
 const lines=[{type:'summary',summary:'Session title'},{type:'user',timestamp:'2026-11-20T16:00:00Z',cwd:'/work',gitBranch:'main',message:{content:'PRIVATE_BODY'}},{type:'assistant',timestamp:'2026-11-20T16:01:00Z',message:{content:[{type:'tool_use',name:'Edit',input:{file_path:'/work/a.js',old_string:'PRIVATE_BODY'}}]}}];
 fs.writeFileSync(path.join(dir,'projects/work/s.jsonl'),lines.map(JSON.stringify).join('\n')+'\nbroken');
 fs.writeFileSync(path.join(dir,'projects/AppData-Local-Temp-demo/s.jsonl'),lines.map(JSON.stringify).join('\n'));
 fs.writeFileSync(path.join(dir,'imports/claude/conversations.json'),JSON.stringify([{uuid:'c',name:'Title',created_at:'2026-11-20T16:00:00Z',updated_at:'2026-11-20T16:01:00Z',chat_messages:[{sender:'human',created_at:'2026-11-20T16:00:00Z',text:'PRIVATE_BODY'}]}]));
 fs.writeFileSync(path.join(dir,'imports/chatgpt/conversations.json'),JSON.stringify([{id:'g',title:'Title',create_time:1795190400,update_time:1795190460,mapping:{a:{message:{author:{role:'user'},create_time:1795190400,content:'PRIVATE_BODY'}}}}]));
 const r=collectAiChats({claudeCodeDir:path.join(dir,'projects'),imports:path.join(dir,'imports')});a.equal(r.items.length,3);a.doesNotMatch(JSON.stringify(r),/PRIVATE_BODY|old_string/);a.equal(r.items[0].work_dir,'work');a.deepEqual(r.items[0].files_edited,['a.js']);a.deepEqual(r.items[0].active_days,['2026-11-21']);a.equal(r.items[0].user_messages,1);
 a.equal(collectAiChats({claudeCodeDir:path.join(dir,'projects'),since:'2027-01-01T00:00:00Z'}).items.length,0);
});
test('AI project filter, malformed imports and path cap are safe',t=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'ax-ai-cap-'));t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));fs.mkdirSync(path.join(dir,'projects/work'),{recursive:true});fs.mkdirSync(path.join(dir,'imports/claude'),{recursive:true});
 const row={type:'assistant',timestamp:'2026-11-20T00:00:00Z',cwd:'C:\\work',message:{content:Array.from({length:25},(_,i)=>({type:'tool_use',name:'Write',input:{file_path:'C:\\work\\f'+i,content:'PRIVATE_BODY'}}))}};
 fs.writeFileSync(path.join(dir,'projects/work/s.jsonl'),JSON.stringify(row));fs.writeFileSync(path.join(dir,'imports/claude/conversations.json'),'PRIVATE_BODY');
 let r=collectAiChats({claudeCodeDir:path.join(dir,'projects'),imports:path.join(dir,'imports')});a.equal(r.items[0].files_edited.length,20);a.equal(r.items[0].files_edited[0],'f0');a.deepEqual(r.errors,['invalid_import']);a.doesNotMatch(JSON.stringify(r),/PRIVATE_BODY/);
 r=collectAiChats({claudeCodeDir:path.join(dir,'projects'),projectFilter:'other'});a.equal(r.items.length,0);
});

const {collectAiChats:collect}=require('../real/collect-ai-chats.cjs');
const collectAiChats=opts=>collect({codexDir:path.join(os.tmpdir(),'ax-missing-codex-sessions'),...opts});
test('Codex metadata variants, recursive paths, privacy and filtering',t=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'ax-codex-'));t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));
 const nested=path.join(dir,'2026/11/20');fs.mkdirSync(nested,{recursive:true});
 const rows=[null,{type:'session_meta',payload:{id:'cx',cwd:'/work/demo',timestamp:'2026-11-20T14:59:00Z'}},
 {timestamp:'2026-11-20T14:59:30Z',type:'event_msg',payload:{type:'user_message',message:'PRIVATE_BODY'}},
 {timestamp:'2026-11-20T14:59:30Z',type:'response_item',payload:{type:'message',role:'user',content:'PRIVATE_BODY'}},
 {timestamp:'2026-11-20T15:01:00Z',type:'response_item',payload:{type:'custom_tool_call',name:'apply_patch',input:'*** Update File: /work/demo/a.js\n+PRIVATE_BODY\n*** Move to: src/a.js'}},
 {timestamp:'2026-11-20T15:02:00Z',type:'response_item',payload:{type:'function_call',name:'apply_patch',arguments:JSON.stringify({patch:'*** Add File: b.js\n+PRIVATE_BODY'})}}];
 fs.writeFileSync(path.join(nested,'s.jsonl'),rows.map(JSON.stringify).join('\n')+'\nbroken');
 const opts={codexDir:dir,claudeCodeDir:path.join(dir,'absent')};
 const r=collectAiChats(opts);a.equal(r.items.length,1);const s=r.items[0];
 a.equal(s.source,'codex');a.equal(s.id,'cx');a.equal(s.work_dir,'demo');a.equal(s.user_messages,1);
 a.equal(s.started_at,'2026-11-20T14:59:00.000Z');a.equal(s.ended_at,'2026-11-20T15:02:00.000Z');
 a.deepEqual(s.active_days,['2026-11-20','2026-11-21']);a.deepEqual(s.files_edited,['a.js','src/a.js','b.js']);
 a.doesNotMatch(JSON.stringify(r),/PRIVATE_BODY|Begin Patch|arguments/);
 a.equal(collectAiChats({...opts,projectFilter:'other, demo'}).items.length,1);
 a.equal(collectAiChats({...opts,projectFilter:'other'}).items.length,0);
 a.equal(collectAiChats({...opts,since:'2026-11-21T00:00:00Z'}).items.length,0);
});
test('Codex alternate field names and edit cap',t=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'ax-codex-variants-'));t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));
 const rows=[{type:'session_metadata',data:{session_id:'variant',working_directory:'C:/work/lab/',started_at:'2026-11-20T00:00:00Z'}},
 {type:'event_msg',timestamp:'2026-11-21T00:00:00Z',payload:{type:'user_message',message:'PRIVATE_BODY'}},
 {type:'response_item',payload:{type:'function_call',name:'functions.apply_patch',arguments:JSON.stringify({input:Array.from({length:25},(_,i)=>'*** Add File: f'+i).join('\n')})}},
 {type:'response_item',payload:{type:'function_call',name:'exec_command',arguments:'*** Add File: unwanted'}},
 {type:'response_item',payload:null},{type:'session_meta',payload:{cwd:42}},false];
 fs.writeFileSync(path.join(dir,'v.jsonl'),rows.map(JSON.stringify).join('\n'));
 const r=collectAiChats({codexDir:dir,claudeCodeDir:path.join(dir,'absent')});
 a.equal(r.items[0].id,'variant');a.equal(r.items[0].work_dir,'lab');a.equal(r.items[0].user_messages,1);
 a.equal(r.items[0].files_edited.length,20);a.equal(r.items[0].files_edited[0],'f0');a.doesNotMatch(JSON.stringify(r),/PRIVATE_BODY|unwanted/);
});
