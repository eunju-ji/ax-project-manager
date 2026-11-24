const fs=require('node:fs'),path=require('node:path'),os=require('node:os');
const short=v=>typeof v==='string'?[...v.split(/\r?\n/)[0]].slice(0,160).join(''):'';
const time=v=>{if(v==null||v==='')return null;const d=new Date(typeof v==='number'?v*1000:v);return Number.isFinite(d.getTime())?d.toISOString():null;};
const pathApi=cwd=>/^[A-Za-z]:[\\/]|^\\\\/.test(cwd)?path.win32:path.posix;
const workDir=cwd=>pathApi(cwd).basename(cwd);
function codexSession(file){
 const item={source:'codex',id:path.basename(file,'.jsonl'),cwd:'',work_dir:'',user_messages:0,files_edited:[]},times=[],edits=[];
 let responseUsers=0,eventUsers=0;
 for(const line of fs.readFileSync(file,'utf8').split(/\r?\n/)){
  let r;try{r=JSON.parse(line);}catch{continue;}
  if(!r||typeof r!=='object')continue;
  const p=r.payload||r.data||r;
  if(time(r.timestamp))times.push(time(r.timestamp));
  if(['session_meta','session_metadata'].includes(r.type)){
   const id=p.id||p.session_id,cwd=p.cwd||p.working_directory;
   if(typeof id==='string'&&id)item.id=id;
   if(typeof cwd==='string'&&cwd)item.cwd=cwd;
   const start=time(p.timestamp||p.started_at||p.start_time);
   if(start){item.started_at=start;times.push(start);}
  }else if(r.type==='turn_context'&&!item.cwd&&typeof p.cwd==='string')item.cwd=p.cwd;
  if(r.type==='event_msg'&&p.type==='user_message')eventUsers++;
  if((r.type==='response_item'||r.type==='message')&&p.role==='user')responseUsers++;
  if(['function_call','custom_tool_call','tool_use'].includes(p.type)&&typeof p.name==='string'&&/(^|\.)apply_patch$/.test(p.name)){
   let input=p.input??p.arguments;
   if(typeof input==='string'){try{input=JSON.parse(input);}catch{/* raw custom tool input */}}
   const patch=typeof input==='string'?input:input?.patch||input?.input;
   if(typeof patch==='string')for(const m of patch.matchAll(/^\*\*\* (?:Add File|Update File|Delete File|Move to): ([^\r\n]+)\r?$/gm))edits.push(m[1]);
  }
 }
 item.work_dir=workDir(item.cwd);item.user_messages=responseUsers||eventUsers;
 const paths=pathApi(item.cwd);
 item.files_edited=[...new Set(edits.map(f=>paths.relative(item.cwd||'.',paths.resolve(item.cwd||'.',f))))].slice(0,20);
 return {item,times};
}
function collectAiChats({claudeCodeDir=path.join(os.homedir(),'.claude/projects'),codexDir=path.join(os.homedir(),'.codex/sessions'),projectFilter=[],imports,since,now=new Date()}={}){
 const items=[],errors=[],collected_at=now.toISOString();
 const error=c=>{if(!errors.includes(c))errors.push(c);};
 if(since&&!time(since))return {collected_at,items,errors:['invalid_since']};
 const filters=(typeof projectFilter==='string'?projectFilter.split(','):projectFilter).map(f=>f.trim()).filter(Boolean);
 const readJson=file=>{try{return JSON.parse(fs.readFileSync(file,'utf8'));}catch{error('invalid_import');return [];}};
 const days=times=>[...new Set(times.filter(Boolean).map(t=>new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Seoul'}).format(new Date(t))))].sort();
 const add=(item,times)=>{
  times=times.filter(Boolean).sort();if(!times.length)return;
  item.started_at=item.started_at||times[0];item.ended_at=item.ended_at||times.at(-1);item.active_days=days(times);
  if(!since||Date.parse(item.ended_at)>=Date.parse(since)||times.some(t=>Date.parse(t)>=Date.parse(since)))items.push(item);
 };
 if(fs.existsSync(claudeCodeDir)){
  try{
   for(const folder of fs.readdirSync(claudeCodeDir,{withFileTypes:true})){
    if(!folder.isDirectory()||folder.name.includes('AppData-Local-Temp')||(filters.length&&!filters.some(f=>folder.name.includes(f))))continue;
    for(const file of fs.readdirSync(path.join(claudeCodeDir,folder.name))){
     if(!file.endsWith('.jsonl'))continue;
     const item={source:'claude_code',id:path.basename(file,'.jsonl'),project_dir:folder.name,cwd:'',git_branch:'',title:'',user_messages:0,files_edited:[]},times=[],edits=[];
     for(const line of fs.readFileSync(path.join(claudeCodeDir,folder.name,file),'utf8').split(/\r?\n/)){
      let r;try{r=JSON.parse(line);}catch{continue;}
      if(!r||typeof r!=='object')continue;
      if(time(r.timestamp))times.push(time(r.timestamp));
      if(typeof r.cwd==='string')item.cwd=r.cwd;if(typeof r.gitBranch==='string')item.git_branch=r.gitBranch;
      if(r.type==='summary')item.title=short(r.summary);
      if(r.type==='user')item.user_messages++;
      for(const c of Array.isArray(r.message?.content)?r.message.content:[]){
       if(c.type==='tool_use'&&['Edit','Write','MultiEdit','NotebookEdit'].includes(c.name)&&typeof (c.input?.file_path||c.input?.notebook_path)==='string')edits.push(c.input.file_path||c.input.notebook_path);
      }
     }
     const paths=/^[A-Za-z]:[\\/]/.test(item.cwd)?path.win32:path.posix;
     item.work_dir=workDir(item.cwd);
     item.files_edited=[...new Set(edits.map(f=>paths.relative(item.cwd||'.',paths.resolve(item.cwd||'.',f))))].slice(0,20);add(item,times);
    }
   }
  }catch{error('session_read_failed');}
 }
 if(fs.existsSync(codexDir)){
  const walk=dir=>{
   let entries;try{entries=fs.readdirSync(dir,{withFileTypes:true});}catch{error('session_read_failed');return;}
   for(const entry of entries){
    const file=path.join(dir,entry.name);
    if(entry.isDirectory())walk(file);
    else if(entry.isFile()&&entry.name.endsWith('.jsonl'))try{
     const {item,times}=codexSession(file);
     if(!filters.length||filters.some(f=>item.cwd.includes(f)))add(item,times);
    }catch{error('session_read_failed');}
   }
  };walk(codexDir);
 }
 if(imports)for(const source of ['claude','chatgpt']){
  const file=path.join(imports,source,'conversations.json');if(!fs.existsSync(file))continue;
  const rows=readJson(file);if(!Array.isArray(rows)){error('invalid_import');continue;}
  for(const r of rows){
   if(!r||typeof r!=='object'){error('invalid_conversation');continue;}
   const claude=source==='claude',id=claude?r.uuid:r.id||r.conversation_id;if(typeof id!=='string'||!id){error('invalid_conversation');continue;}
   const messages=claude?(Array.isArray(r.chat_messages)?r.chat_messages:[]):Object.values(r.mapping||{}).map(n=>n?.message).filter(Boolean);
   const times=messages.map(m=>time(claude?m.created_at:m.create_time)).filter(Boolean),start=time(claude?r.created_at:r.create_time),end=time(claude?r.updated_at:r.update_time);
   add({source:claude?'claude_ai':'chatgpt',id,url:(claude?'https://claude.ai/chat/':'https://chatgpt.com/c/')+encodeURIComponent(id),title:short(claude?r.name:r.title),started_at:start,ended_at:end,user_messages:messages.filter(m=>claude?m.sender==='human':m.author?.role==='user').length},[...times,start,end]);
  }
 }
 return {collected_at,items,errors};
}
function main(args){
 const opts={};for(let i=0;i<args.length;i++){if(!['--out','--claude-code-dir','--codex-dir','--project-filter','--imports','--since'].includes(args[i])||!args[i+1])throw Error('arguments');opts[args[i].slice(2)]=args[++i];}
 if(!opts.out)throw Error('arguments');
 const result=collectAiChats({claudeCodeDir:opts['claude-code-dir'],codexDir:opts['codex-dir'],projectFilter:opts['project-filter'],imports:opts.imports,since:opts.since});
 fs.writeFileSync(opts.out,JSON.stringify(result,null,2)+'\n',{mode:0o600});if(result.errors.length)process.exitCode=1;
}
if(require.main===module)try{main(process.argv.slice(2));}catch{console.error('collector_failed');process.exitCode=1;}
module.exports={collectAiChats};
