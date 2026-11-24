const fs=require('node:fs'),path=require('node:path');
const {execFile}=require('node:child_process');
const {promisify}=require('node:util');
const exec=promisify(execFile);

function sanitizeRemote(value){
 const raw=value.trim();
 if(/^[A-Za-z]:[\\/]/.test(raw))return null;
 try{
  const url=new URL(raw);
  if(!['https:','http:','ssh:','git:'].includes(url.protocol)||!url.hostname)return null;
  return url.host+url.pathname;
 }catch{
  const m=raw.match(/^(?:[^\s/@:]+@)?([\w.-]+):([^\s?#]+)(?:[?#].*)?$/);
  return m?m[1]+'/'+m[2]:null;
 }
}

async function collectLocalGit({repos=[],since,author,now=new Date()}={}){
 const result={collected_at:now.toISOString(),items:[],errors:[]};
 const error=code=>{if(!result.errors.includes(code))result.errors.push(code);};
 if(since&&!Number.isFinite(Date.parse(since))){error('invalid_since');return result;}
 const dirs=typeof repos==='string'?repos.split(',').map(s=>s.trim()).filter(Boolean):repos;
 if(!Array.isArray(dirs)||!dirs.length){error('invalid_repos');return result;}
 for(const dir of [...new Set(dirs)]){
  if(typeof dir!=='string'||!dir){error('invalid_repos');continue;}
  const cwd=path.resolve(dir);
  const git=async args=>(await exec('git',args,{cwd,encoding:'utf8',windowsHide:true,timeout:60000,maxBuffer:32*1024*1024})).stdout;
  try{
   const args=['log','--all','--no-merges','-z','--format=%H%x00%s%x00%cI'];
   if(since)args.push('--since='+new Date(since).toISOString());
   if(author)args.push('--author='+author);
   args.push('--');
   const fields=(await git(args)).split('\0');
   let remote;
   try{remote=sanitizeRemote(await git(['remote','get-url','origin']));}catch{/* repositories may have no origin */}
   if(!remote){
    const names=(await git(['remote'])).trim().split(/\r?\n/).filter(Boolean);
    for(const name of names){try{remote=sanitizeRemote(await git(['remote','get-url',name]));}catch{/* optional remote */}if(remote)break;}
   }
   for(let i=0;i+2<fields.length;i+=3){
    const [id,subject,at]=fields.slice(i,i+3);
    if(!/^[a-f0-9]{40,64}$/.test(id)||!Number.isFinite(Date.parse(at)))continue;
    const files=(await git(['diff-tree','--root','--no-commit-id','--name-only','-r','-z',id,'--'])).split('\0').filter(Boolean);
    const item={kind:'commit',repo:path.basename(cwd),id,title:[...subject.split(/\r?\n/)[0]].slice(0,160).join(''),at,files_changed:files.length};
    try{
     // A containing branch is evidence of reachability, not the historical checkout.
     const branch=(await git(['branch','--all','--contains',id,'--format=%(refname:short)'])).trim().split(/\r?\n/)[0];
     if(branch)item.branch=branch;
    }catch{/* optional branch */}
    if(remote)item.remote=remote;
    result.items.push(item);
   }
  }catch{error('git_read_failed');}
 }
 return result;
}

async function main(args){
 const opts={};for(let i=0;i<args.length;i++){
  if(!['--repos','--out','--since','--author'].includes(args[i])||!args[i+1])throw Error('arguments');
  opts[args[i].slice(2)]=args[++i];
 }
 if(!opts.repos||!opts.out)throw Error('arguments');
 const result=await collectLocalGit(opts);
 fs.writeFileSync(opts.out,JSON.stringify(result,null,2)+'\n',{mode:0o600});
 if(result.errors.length)process.exitCode=1;
}
if(require.main===module)main(process.argv.slice(2)).catch(()=>{console.error('collector_failed');process.exitCode=1;});
module.exports={collectLocalGit,sanitizeRemote};
