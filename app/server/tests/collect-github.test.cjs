const test=require('node:test'),a=require('node:assert/strict');
test('github collector paginates and emits metadata only',async()=>{
 const {collectGithub}=require('../real/collect-github.cjs');let calls=[];
 const fetchImpl=async(url,opts)=>{calls.push({url,opts});const p=new URL(url).pathname;return {ok:true,status:200,headers:{get:()=>null},json:async()=>p.endsWith('/commits')?[{sha:'abc',html_url:'https://github.com/o/r/commit/abc',commit:{message:'Title\nPRIVATE_BODY',author:{date:'2026-11-20T00:00:00Z'}}}]:p.endsWith('/pulls')?[{number:1,title:'PR',body:'PRIVATE_BODY',user:{login:'demo'},html_url:'https://github.com/o/r/pull/1',updated_at:'2026-11-20T00:00:00Z',head:{ref:'main'},state:'open'}]:[]};};
 const r=await collectGithub({github:{login:'demo',repos:['o/r']}},{fetchImpl,token:'SYNTHETIC_TOKEN',since:'2026-11-19T00:00:00Z',now:new Date('2026-11-21')});
 a.equal(r.items.length,2);a.ok(calls.every(c=>c.opts.headers.Authorization==='Bearer SYNTHETIC_TOKEN'));a.doesNotMatch(JSON.stringify(r),/PRIVATE_BODY|SYNTHETIC_TOKEN/);
});
test('github failure returns codes without remote input',async()=>{
 const {collectGithub}=require('../real/collect-github.cjs');
 const r=await collectGithub({github:{login:'demo',repos:['o/r']}},{fetchImpl:async()=>({ok:false,status:403,headers:{get:()=> '0'}})});
 a.ok(r.errors.includes('rate_limit'));a.deepEqual(r.items,[]);
});
test('github discovers recent repositories and follows full pages without authentication',async()=>{
 const {collectGithub}=require('../real/collect-github.cjs'),seen=[];
 const fetchImpl=async(url,opts)=>{a.equal(opts.headers.Authorization,undefined);const u=new URL(url);seen.push(u);let rows=[];
 if(u.pathname==='/users/demo/repos')rows=u.searchParams.get('page')==='1'?Array.from({length:100},(_,i)=>({full_name:'o/old'+i,pushed_at:'2020-01-01T00:00:00Z'})):[{full_name:'o/recent',pushed_at:'2026-11-20T00:00:00Z'}];
 return {ok:true,json:async()=>rows};};
 const r=await collectGithub({github:{login:'demo'}},{fetchImpl,token:'',now:new Date('2026-11-21')});a.deepEqual(r.errors,[]);a.ok(seen.some(u=>u.searchParams.get('page')==='2'));a.ok(seen.some(u=>u.pathname==='/repos/o/recent/commits'));a.ok(!seen.some(u=>u.pathname.startsWith('/repos/o/old')));
});
