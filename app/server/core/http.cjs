// Decode before URL dot-segment resolution; every route and static allowlist uses this path.
function requestUrl(target){
 const bad=()=>{throw Object.assign(Error('invalid_path'),{status:400});};
 if(typeof target!=='string'||!target.startsWith('/'))return bad();
 const split=target.indexOf('?'),raw=split<0?target:target.slice(0,split);let decoded;
 try{decoded=decodeURIComponent(raw);}catch{return bad();}
 if(/[\\\0#]/.test(decoded)||decoded.split('/').includes('..'))return bad();
 const pathname='/'+decoded.split('/').filter(p=>p&&p!=='.').join('/').toLowerCase();
 return {pathname,searchParams:new URLSearchParams(split<0?'':target.slice(split+1))};
}

const fail=(code,status=400)=>{throw Object.assign(Error(code),{code,status});};
const routes={'GET /api/view':'view','GET /api/me':'me','POST /api/decision':'decision','POST /api/pilot-decision':'pilot-decision','POST /api/ingest/delta':'ingest','POST /api/inbox':'inbox-put','GET /api/inbox':'inbox-get'};
routes['POST /api/correction']='correction';
const route=(method,path)=>routes[method+' '+path]||null;
const allowed=(role,action)=>['admin','member','viewer'].includes(role)&&(action.startsWith('admin')?role==='admin':['decision','pilot-decision','correction'].includes(action)?role!=='viewer':true);
const csrf=(expected,origin,token,actual)=>origin===expected&&typeof token==='string'&&token.length>0&&token===actual;
const securityHeaders=(secure=true)=>({'X-Content-Type-Options':'nosniff','X-Frame-Options':'DENY','Referrer-Policy':'no-referrer','Content-Security-Policy':"default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'",...(secure?{'Strict-Transport-Security':'max-age=31536000','Cache-Control':'no-store'}:{})});
const staticPath=p=>/^(index\.html|app\.js|data\.js|styles\.css|src\/model\.js|assets\/[\w-]+\.png)$/.test(p.slice(1)||'index.html');
function limitDelta(delta){if(delta&&typeof delta==='object'&&require('./delta.cjs').counts(delta)>200)fail('batch_limit',413);}
function validateInbox(input){
 if(!input||typeof input!=='object'||Array.isArray(input)||Object.keys(input).some(k=>k!=='records')||!Array.isArray(input.records))fail('invalid_inbox');
 if(input.records.length>200)fail('batch_limit',413);
 const fields=['id','service','title','summary','actor','occurred_at','url','source_id'];
 for(const r of input.records){if(!r||typeof r!=='object'||Array.isArray(r)||!r.id||Object.keys(r).some(k=>!fields.includes(k)||typeof r[k]!=='string'||[...r[k]].length>160)||/AIza[0-9A-Za-z_-]{20,}|token=|-----BEGIN|SMTP_PASSWORD=|KEY_JSON=/.test(JSON.stringify(r)))fail('invalid_inbox');}
 return input.records;
}
async function collection({action,input,since,dryRun,token,storage}){
 if(!token||action!=='inbox-put'&&token.role!=='admin')fail('unauthorized',401);
 if(action==='ingest'){limitDelta(input);const r=await storage.applyDelta(input,{dryRun});const {ok,added,updated,removed,ignored,rejected}=r;return {status:ok?200:422,data:{ok,added,updated,removed,ignored,rejected}};}
 if(action==='inbox-put'){if(!token.person_id)fail('unauthorized',401);return {status:200,data:await storage.putInbox(token.person_id,validateInbox(input))};}
 if(since!==null&&since!==undefined&&!/^\d+$/.test(since))fail('invalid_since');
 return {status:200,data:await storage.getInbox(since||'0')};
}
module.exports={requestUrl,route,allowed,csrf,securityHeaders,staticPath,limitDelta,validateInbox,collection};
