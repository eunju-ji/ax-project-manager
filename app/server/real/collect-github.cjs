const fs=require('node:fs');
const title=v=>typeof v==='string'?[...v.split(/\r?\n/)[0]].slice(0,160).join(''):'';
async function collectGithub(state,{fetchImpl=globalThis.fetch,token=process.env.GITHUB_TOKEN,since,now=new Date()}={}){
 const collected_at=now.toISOString(),login=state.github?.login,items=[],errors=[];
 const error=code=>{if(!errors.includes(code))errors.push(code);};
 if(typeof login!=='string'||!login){error('invalid_config');return {collected_at,login:null,items,errors};}
 since=since||state.github.checkpoint||new Date(now.getTime()-90*86400000).toISOString();
 if(!Number.isFinite(Date.parse(since))){error('invalid_since');return {collected_at,login,items,errors};}
 const headers={'User-Agent':'ax-pm-collector',Accept:'application/vnd.github+json',...(token?{Authorization:'Bearer '+token}:{})};
 async function pages(resource,params={}){
  const rows=[];
  for(let page=1;;page++){
   const url=new URL('https://api.github.com'+resource);url.search=new URLSearchParams({...params,per_page:100,page});
   try{
    const r=await fetchImpl(url.href,{headers,redirect:'error'});
    if(!r.ok){error(r.status===429||(r.status===403&&r.headers?.get('x-ratelimit-remaining')==='0')?'rate_limit':'request_failed');break;}
    const data=await r.json();if(!Array.isArray(data)){error('invalid_response');break;}
    rows.push(...data);if(data.length<100)break;
   }catch{error('request_failed');break;}
  }return rows;
 }
 let repos=state.github.repos;
 if(!Array.isArray(repos)||!repos.length)repos=(await pages('/users/'+encodeURIComponent(login)+'/repos')).filter(r=>Date.parse(r.pushed_at)>=now.getTime()-90*86400000).map(r=>r.full_name);
 for(const repo of repos){
  if(typeof repo!=='string'||!/^[-\w.]+\/[-\w.]+$/.test(repo)){error('invalid_repo');continue;}
  const base='/repos/'+repo;
  for(const c of await pages(base+'/commits',{author:login,since})){
   const at=c.commit?.author?.date;if(!c.sha||!at)continue;
   const prs=await pages(base+'/commits/'+encodeURIComponent(c.sha)+'/pulls');
   items.push({kind:'commit',repo,id:c.sha,url:c.html_url,title:title(c.commit?.message),at,...(prs[0]?.number?{pr_number:prs[0].number}:{})});
  }
  for(const p of await pages(base+'/pulls',{state:'all',sort:'updated',direction:'desc'})){
   if(!Number.isFinite(Date.parse(p.updated_at))||Date.parse(p.updated_at)<Date.parse(since))continue;
   items.push({kind:'pull_request',repo,id:p.number,url:p.html_url,title:title(p.title),at:p.updated_at,branch:p.head?.ref,state:p.state});
  }
  for(const i of await pages(base+'/issues',{creator:login,since,state:'all'})){
   if(i.pull_request)continue;
   items.push({kind:'issue',repo,id:i.number,url:i.html_url,title:title(i.title),at:i.updated_at,state:i.state});
  }
 }
 return {collected_at,login,items,errors};
}
async function main(args){
 const opts={};for(let i=0;i<args.length;i++){if(!['--state','--out','--since'].includes(args[i])||!args[i+1])throw Error('arguments');opts[args[i].slice(2)]=args[++i];}
 if(!opts.state||!opts.out)throw Error('arguments');
 const result=await collectGithub(JSON.parse(fs.readFileSync(opts.state,'utf8')),{since:opts.since});
 fs.writeFileSync(opts.out,JSON.stringify(result,null,2)+'\n',{mode:0o600});
 if(result.errors.length)process.exitCode=1;
}
if(require.main===module)main(process.argv.slice(2)).catch(()=>{console.error('collector_failed');process.exitCode=1;});
module.exports={collectGithub};
