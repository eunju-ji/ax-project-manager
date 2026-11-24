const test=require('node:test'),a=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
test('AI collector indexes synthetic sessions and exports without bodies',t=>{
 const {collectAiChats}=require('../real/collect-ai-chats.cjs'),dir=fs.mkdtempSync(path.join(os.tmpdir(),'ax-ai-'));t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));
 for(const sub of ['projects/work','projects/AppData-Local-Temp-demo','imports/claude','imports/chatgpt'])fs.mkdirSync(path.join(dir,sub),{recursive:true});
 const lines=[{type:'summary',summary:'Session title'},{type:'user',timestamp:'2026-11-20T16:00:00Z',cwd:'/work',gitBranch:'main',message:{content:'PRIVATE_BODY'}},{type:'assistant',timestamp:'2026-11-20T16:01:00Z',message:{content:[{type:'tool_use',name:'Edit',input:{file_path:'/work/a.js',old_string:'PRIVATE_BODY'}}]}}];
 fs.writeFileSync(path.join(dir,'projects/work/s.jsonl'),lines.map(JSON.stringify).join('\n')+'\nbroken');
 fs.writeFileSync(path.join(dir,'projects/AppData-Local-Temp-demo/s.jsonl'),lines.map(JSON.stringify).join('\n'));
 fs.writeFileSync(path.join(dir,'imports/claude/conversations.json'),JSON.stringify([{uuid:'c',name:'Title',created_at:'2026-11-20T16:00:00Z',updated_at:'2026-11-20T16:01:00Z',chat_messages:[{sender:'human',created_at:'2026-11-20T16:00:00Z',text:'PRIVATE_BODY'}]}]));
 fs.writeFileSync(path.join(dir,'imports/chatgpt/conversations.json'),JSON.stringify([{id:'g',title:'Title',create_time:1795190400,update_time:1795190460,mapping:{a:{message:{author:{role:'user'},create_time:1795190400,content:'PRIVATE_BODY'}}}}]));
 const r=collectAiChats({claudeCodeDir:path.join(dir,'projects'),imports:path.join(dir,'imports')});a.equal(r.items.length,3);a.doesNotMatch(JSON.stringify(r),/PRIVATE_BODY|old_string/);a.deepEqual(r.items[0].files_edited,['a.js']);a.deepEqual(r.items[0].active_days,['2026-11-21']);a.equal(r.items[0].user_messages,1);
 a.equal(collectAiChats({claudeCodeDir:path.join(dir,'projects'),since:'2027-01-01T00:00:00Z'}).items.length,0);
});
test('AI project filter, malformed imports and path cap are safe',t=>{
 const {collectAiChats}=require('../real/collect-ai-chats.cjs'),dir=fs.mkdtempSync(path.join(os.tmpdir(),'ax-ai-cap-'));t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));fs.mkdirSync(path.join(dir,'projects/work'),{recursive:true});fs.mkdirSync(path.join(dir,'imports/claude'),{recursive:true});
 const row={type:'assistant',timestamp:'2026-11-20T00:00:00Z',cwd:'C:\\work',message:{content:Array.from({length:25},(_,i)=>({type:'tool_use',name:'Write',input:{file_path:'C:\\work\\f'+i,content:'PRIVATE_BODY'}}))}};
 fs.writeFileSync(path.join(dir,'projects/work/s.jsonl'),JSON.stringify(row));fs.writeFileSync(path.join(dir,'imports/claude/conversations.json'),'PRIVATE_BODY');
 let r=collectAiChats({claudeCodeDir:path.join(dir,'projects'),imports:path.join(dir,'imports')});a.equal(r.items[0].files_edited.length,20);a.equal(r.items[0].files_edited[0],'f0');a.deepEqual(r.errors,['invalid_import']);a.doesNotMatch(JSON.stringify(r),/PRIVATE_BODY/);
 r=collectAiChats({claudeCodeDir:path.join(dir,'projects'),projectFilter:'other'});a.equal(r.items.length,0);
});
