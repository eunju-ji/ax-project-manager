import decisionCore from '../../server/core/decision.cjs';
import core from '../../server/core/http.cjs';
import {createIdentity} from './identity.js';
import {createMemoryStorage} from './storage.js';
import {hash,same} from './crypto.js';
async function readJSON(req,limit){
 if(!/^application\/json(?:;|$)/i.test(req.headers.get('content-type')||''))throw Object.assign(Error(),{status:415});
 const reader=req.body?.getReader();if(!reader)throw Object.assign(Error(),{status:400});let size=0;const chunks=[];
 while(true){const {value,done}=await reader.read();if(done)break;size+=value.length;if(size>limit){await reader.cancel();throw Object.assign(Error(),{status:413});}chunks.push(value);}
 const bytes=new Uint8Array(size);let offset=0;for(const c of chunks){bytes.set(c,offset);offset+=c.length;}
 try{return JSON.parse(new TextDecoder().decode(bytes));}catch{throw Object.assign(Error(),{status:400});}
}
export function createHandler(env,{storage=createMemoryStorage(),...deps}={}){
 const identity=createIdentity(env,storage,deps);
 const headers=core.securityHeaders(true);
 const json=(status,data)=>new Response(JSON.stringify(data),{status,headers:{...headers,'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'}});
 return async request=>{try{
  const u=new URL(request.url);if(env.PUBLIC_BASE_URL&&u.origin!==new URL(env.PUBLIC_BASE_URL).origin)return json(403,{error:'host'});
  const url=core.requestUrl(u.pathname+u.search),action=core.route(request.method,url.pathname);
  if(['ingest','inbox-put','inbox-get'].includes(action)){
   const bearer=/^Bearer ([A-Za-z0-9_-]{20,256})$/.exec(request.headers.get('authorization')||'');let token=null,digest='';
   if(bearer){digest=await hash(bearer[1]);if((env.INGEST_TOKEN_HASHES||'').split(',').some(h=>same(h.trim(),digest)))token={role:'admin'};
    const personal=JSON.parse(env.INBOX_TOKEN_HASHES||'{}')[digest];if(personal)token={role:'person',person_id:personal};
    token=token||await storage.getToken(digest);
   }
   if(!token)return json(401,{error:'unauthorized'});
   const result=await core.collection({action,input:request.method==='POST'?await readJSON(request,5*1024*1024):null,since:url.searchParams.get('since'),dryRun:url.searchParams.get('dry_run')==='true',token,storage});
   await storage.audit('collection','token:'+digest.slice(0,12));return json(result.status,result.data);
  }
  const user=await identity.identify(request);if(!user){await storage.audit('login_denied','anonymous');return json(401,{error:'unauthorized'});}
  if(action==='me')return json(200,{email:user.email,person_id:user.person_id,role:user.role,csrf:await hash(request.headers.get('Cf-Access-Jwt-Assertion'))});
  if(action&&!core.allowed(user.role,action))return json(403,{error:'forbidden'});
  if(!['GET','HEAD'].includes(request.method)){
   // Access is cookie-authenticated; require same Origin plus non-simple custom header.
   // Header value binds to this verified Access assertion without echoing the assertion.
   const csrf=await hash(request.headers.get('Cf-Access-Jwt-Assertion'));
   if(!core.csrf(u.origin,request.headers.get('origin'),request.headers.get('x-csrf-token'),csrf))return json(403,{error:'csrf'});
  }
  if(action==='decision'){const input=await readJSON(request,8192);if(!decisionCore.validDecision(input))return json(400,{error:'invalid decision'});return json(200,await storage.decide(input));}
  if(action==='view'){await storage.audit('view',user.id);return json(200,await storage.view());}
  if(url.pathname==='/data.js')return new Response('const AX_DATA = {projects:[],reviews:[],persons:[],folders:{},demoAsOf:"",demoNotice:""}; const AX_ASSETS = {};',{headers:{...headers,'Content-Type':'text/javascript'}});
  if(url.pathname.startsWith('/api/'))return json(404,{error:'not_found'});
  if(!['GET','HEAD'].includes(request.method))return json(405,{error:'method'});
  if(!core.staticPath(url.pathname))return json(404,{error:'not_found'});
  if((url.pathname==='/'||url.pathname==='/index.html')&&url.searchParams.get('data')!=='real')return new Response(null,{status:302,headers:{...headers,Location:'/?data=real'}});
  const assetURL=new URL(request.url);assetURL.pathname=url.pathname;const r=await env.ASSETS.fetch(new Request(assetURL,request));const h=new Headers(r.headers);for(const [k,v] of Object.entries(headers))h.set(k,v);return new Response(r.body,{status:r.status,headers:h});
 }catch(e){return json(e.status||500,{error:e.code||'request_failed'});}};
}
const handlers=new WeakMap();
export default {fetch(request,env){let handler=handlers.get(env);if(!handler){handler=createHandler(env);handlers.set(env,handler);}return handler(request);}};
