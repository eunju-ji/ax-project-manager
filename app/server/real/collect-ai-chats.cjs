const fs=require('node:fs'),path=require('node:path'),os=require('node:os');
const short=v=>typeof v==='string'?[...v.split(/\r?\n/)[0]].slice(0,160).join(''):'';
const time=v=>{if(v==null||v==='')return null;const d=new Date(typeof v==='number'?v*1000:v);return Number.isFinite(d.getTime())?d.toISOString():null;};
function collectAiChats({claudeCodeDir=path.join(os.homedir(),'.claude/projects'),projectFilter=[],imports,since,now=new Date()}={}){
 const items=[],errors=[],collected_at=now.toISOString();
 const error=c=>{if(!errors.includes(c))errors.push(c);};
 if(since&&!time(since))return {collected_at,items,errors:['invalid_since']};
 const filters=typeof projectFilter==='string'?projectFilter.split(',').filter(Boolean):projectFilter;
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
      if(time(r.timestamp))times.push(time(r.timestamp));
      if(typeof r.cwd==='string')item.cwd=r.cwd;if(typeof r.gitBranch==='string')item.git_branch=r.gitBranch;
      if(r.type==='summary')item.title=short(r.summary);
      if(r.type==='user')item.user_messages++;
      for(const c of Array.isArray(r.message?.content)?r.message.content:[]){
       if(c.type==='tool_use'&&['Edit','Write','MultiEdit','NotebookEdit'].includes(c.name)&&typeof (c.input?.file_path||c.input?.notebook_path)==='string')edits.push(c.input.file_path||c.input.notebook_path);
      }
     }
     const paths=/^[A-Za-z]:[\\/]/.test(item.cwd)?path.win32:path.posix;
     item.files_edited=[...new Set(edits.map(f=>paths.relative(item.cwd||'.',paths.resolve(item.cwd||'.',f))))].slice(0,20);add(item,times);
    }
   }
  }catch{error('session_read_failed');}
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
 const opts={};for(let i=0;i<args.length;i++){if(!['--out','--claude-code-dir','--project-filter','--imports','--since'].includes(args[i])||!args[i+1])throw Error('arguments');opts[args[i].slice(2)]=args[++i];}
 if(!opts.out)throw Error('arguments');
 const result=collectAiChats({claudeCodeDir:opts['claude-code-dir'],projectFilter:opts['project-filter'],imports:opts.imports,since:opts.since});
 fs.writeFileSync(opts.out,JSON.stringify(result,null,2)+'\n',{mode:0o600});if(result.errors.length)process.exitCode=1;
}
if(require.main===module)try{main(process.argv.slice(2));}catch{console.error('collector_failed');process.exitCode=1;}
module.exports={collectAiChats};
