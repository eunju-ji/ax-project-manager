'use strict';
const crypto = require('node:crypto');
const {trustedProxies,clientIP}=require('./client-ip.cjs');
const random = () => crypto.randomBytes(32).toString('base64url');
const hash = value => crypto.createHash('sha256').update(value).digest('hex');
const same = (a,b) => typeof a==='string' && typeof b==='string' && a.length===b.length && crypto.timingSafeEqual(Buffer.from(a),Buffer.from(b));
const cookie = (name,value,age) => `${name}=${value}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${age}`;
const cookies = req => Object.fromEntries((req.headers.cookie||'').split(';').map(s=>s.trim().split('=')));
function config(env=process.env,host='127.0.0.1') {
 const mode=env.AUTH_MODE||'off';
 if(!['oidc','off'].includes(mode))throw Error('AUTH_MODE');
 if(mode==='off'&&!['127.0.0.1','localhost'].includes(host))throw Error('AUTH_MODE');
 if(mode==='oidc') {
  const missing=['OAUTH_CLIENT_ID','OAUTH_CLIENT_SECRET','OAUTH_REDIRECT_URI','ALLOWED_DOMAIN','ADMIN_EMAILS','SESSION_SECRET','PUBLIC_BASE_URL','DATA_DIR'].filter(k=>!env[k]);
  if(missing.length)throw Error(missing.join(', '));
  if(env.SESSION_SECRET.length<32)throw Error('SESSION_SECRET');
  let base,redirect,issuer;
  try{base=new URL(env.PUBLIC_BASE_URL);redirect=new URL(env.OAUTH_REDIRECT_URI);issuer=new URL(env.OAUTH_ISSUER||'https://accounts.google.com');}catch{throw Error('PUBLIC_BASE_URL, OAUTH_REDIRECT_URI, OAUTH_ISSUER');}
  if([base,redirect,issuer].some(u=>u.protocol!=='https:'||u.username||u.password)||redirect.origin!==base.origin||redirect.pathname!=='/auth/callback'||redirect.search||redirect.hash||base.pathname!=='/'||base.search||base.hash)throw Error('PUBLIC_BASE_URL, OAUTH_REDIRECT_URI, OAUTH_ISSUER');
 }
 return {mode,env,host,isTrustedProxy:trustedProxies(env.TRUSTED_PROXIES||''),origin:mode==='oidc'?new URL(env.PUBLIC_BASE_URL).origin:null,issuer:env.OAUTH_ISSUER||'https://accounts.google.com'};
}
async function body(req,limit=8192) {
 if(!/^application\/json(?:;|$)/i.test(req.headers['content-type']||''))throw Object.assign(Error(),{status:415});
 const chunks=[];let size=0;
 for await(const chunk of req){size+=chunk.length;if(size>limit)throw Object.assign(Error(),{status:413});chunks.push(chunk);}
 try {const input=JSON.parse(Buffer.concat(chunks));if(!input||typeof input!=='object'||Array.isArray(input))throw Error();return input;}catch{throw Object.assign(Error(),{status:400});}
}
function createAuth(db,cfg,{fetch:fetcher=globalThis.fetch,jwks,now=Date.now}={}) {
 const core=require('../core/http.cjs');
 const storage=require('../node/storage.cjs').createStorage(db,{dataset:require('node:path').join(cfg.env.DATA_DIR||'.','real-dataset.json'),now});
 const {env}=cfg, attempts=new Map(), pending=new Map();let discovery,keys,keysAt=0;
 const opaque=()=>{const value=random();return value+'.'+crypto.createHmac('sha256',env.SESSION_SECRET).update(value).digest('base64url');};
 const tx=fn=>db.tx(fn);
 // Separate audit workspace survives dataset rebuilds and contains no raw tokens or request payloads.
 tx(t=>t.run("INSERT OR IGNORE INTO workspaces(workspace_id,id,display_key) VALUES ('auth','auth','auth')"));
 const audit=(action,actor='anonymous')=>tx(t=>{const id=crypto.randomUUID();t.run('INSERT INTO access_audit(workspace_id,id,display_key,actor_id,action,applied_at) VALUES (?,?,?,?,?,?)','auth',id,id,actor,action,new Date(now()).toISOString());});
 const limited=(key,limit=20)=>{const n=now();for(const [k,v] of attempts)if(n-v.start>=60000)attempts.delete(k);const a=attempts.get(key)||{start:n,count:0};a.count++;attempts.set(key,a);return a.count>limit;};
 async function remote(url,options){const r=await fetcher(url,{...options,signal:AbortSignal.timeout(10000),redirect:'error'});if(!r.ok)throw Error();return r.json();}
 async function metadata(){if(!discovery){const d=await remote(cfg.issuer+'/.well-known/openid-configuration');if(d.issuer!==cfg.issuer)throw Error();for(const k of ['authorization_endpoint','token_endpoint','jwks_uri'])if(new URL(d[k]).protocol!=='https:')throw Error();discovery=d;}return discovery;}
 async function verify(token,nonce) {
  if(typeof token!=='string'||token.length>20000)throw Error();
  const [a,b,c,...extra]=token.split('.');if(extra.length||!a||!b||!c)throw Error();
  const h=JSON.parse(Buffer.from(a,'base64url')),p=JSON.parse(Buffer.from(b,'base64url'));
  if(h.alg!=='RS256'||typeof h.kid!=='string')throw Error();
  if(!keys||now()-keysAt>3600000){keys=jwks||await remote((await metadata()).jwks_uri);keysAt=now();}
  const findKey=()=>keys.keys.find(k=>k.kid===h.kid&&k.kty==='RSA'&&(!k.use||k.use==='sig')&&(!k.alg||k.alg==='RS256'));
  let key=findKey();
  if(!key&&!jwks&&now()-keysAt>=60000){keys=await remote((await metadata()).jwks_uri);keysAt=now();key=findKey();}
  if(!key||!crypto.verify('RSA-SHA256',Buffer.from(a+'.'+b),crypto.createPublicKey({key,format:'jwk'}),Buffer.from(c,'base64url')))throw Error();
  const aud=Array.isArray(p.aud)?p.aud:[p.aud];
  if(p.iss!==cfg.issuer||!aud.includes(env.OAUTH_CLIENT_ID)||(aud.length>1&&p.azp!==env.OAUTH_CLIENT_ID)||(p.azp&&p.azp!==env.OAUTH_CLIENT_ID)||!Number.isFinite(p.exp)||p.exp*1000<=now()||!Number.isFinite(p.iat)||p.iat*1000>now()+60000||(p.nbf&&p.nbf*1000>now())||!same(p.nonce,nonce)||p.hd!==env.ALLOWED_DOMAIN||p.email_verified!==true||typeof p.sub!=='string'||!p.sub||typeof p.email!=='string'||!p.email.toLowerCase().endsWith('@'+env.ALLOWED_DOMAIN.toLowerCase()))throw Error();
  return p.email.toLowerCase();
 }
 function session(req){const id=cookies(req)['__Host-sid'];if(!id||id.length>128)return null;return tx(t=>{const s=t.get('SELECT s.*,u.email,u.person_id,u.role,u.status FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.id=?',hash(id));if(!s)return null;if(s.status!=='active'||s.expires_at<=now()||s.last_seen_at+12*3600000<=now()){t.run('DELETE FROM sessions WHERE id=?',s.id);return null;}t.run('UPDATE sessions SET last_seen_at=? WHERE id=?',now(),s.id);return s;});}
 async function handle(req,res,url,json) {
  const route=url.pathname, write=!['GET','HEAD'].includes(req.method);
  if(route==='/auth/login'&&req.method==='GET') {
   if(limited('login:'+clientIP(req,cfg.isTrustedProxy)))return json(429,{error:'login_limited'}),true;
   for(const [k,v] of pending)if(v.exp<=now())pending.delete(k);
   if(pending.size>=10000)return json(429,{error:'login_limited'}),true;
   const state=random(),nonce=random(),verifier=random(),id=opaque();pending.set(hash(id),{state,nonce,verifier,exp:now()+600000});
   const d=await metadata(),u=new URL(d.authorization_endpoint);
   u.search=new URLSearchParams({client_id:env.OAUTH_CLIENT_ID,redirect_uri:env.OAUTH_REDIRECT_URI,response_type:'code',scope:'openid email',state,nonce,hd:env.ALLOWED_DOMAIN,code_challenge:crypto.createHash('sha256').update(verifier).digest('base64url'),code_challenge_method:'S256'}).toString();
   res.writeHead(302,{'Location':u.href,'Set-Cookie':cookie('__Host-oidc',id,600)});res.end();return true;
  }
  if(route==='/auth/callback'&&req.method==='GET') {
   res.setHeader('Set-Cookie',cookie('__Host-oidc','',0));
   if(limited('callback:'+clientIP(req,cfg.isTrustedProxy)))return json(429,{error:'login_limited'}),true;
   try {
    const id=cookies(req)['__Host-oidc']||'',p=pending.get(hash(id));pending.delete(hash(id));
    if(!p||p.exp<=now()||!same(p.state,url.searchParams.get('state'))||!url.searchParams.get('code'))throw Error();
    const d=await metadata(),tokens=await remote(d.token_endpoint,{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({grant_type:'authorization_code',code:url.searchParams.get('code'),client_id:env.OAUTH_CLIENT_ID,client_secret:env.OAUTH_CLIENT_SECRET,redirect_uri:env.OAUTH_REDIRECT_URI,code_verifier:p.verifier})});
    const email=await verify(tokens.id_token,p.nonce);if(limited('email:'+hash(email)))throw Error();
    const sid=opaque(),csrf=random();
    const user=tx(t=>{let u=t.get('SELECT * FROM users WHERE email=?',email);if(!u&&(env.ADMIN_EMAILS||'').split(',').map(e=>e.trim().toLowerCase()).includes(email)){const uid=crypto.randomUUID();t.run("INSERT INTO users(id,email,role,status,created_at) VALUES (?,?,'admin','active',?)",uid,email,now());u=t.get('SELECT * FROM users WHERE id=?',uid);}if(!u||u.status==='disabled')throw Error();t.run("UPDATE users SET status='active',last_login_at=? WHERE id=?",now(),u.id);t.run('INSERT INTO sessions VALUES (?,?,?,?,?,?)',hash(sid),u.id,csrf,now(),now(),now()+7*86400000);return u;});
    const person=personFor(email);
    if(!user.person_id&&person)tx(t=>t.run('UPDATE users SET person_id=? WHERE id=? AND person_id IS NULL',person,user.id));
    audit('login',user.id);res.setHeader('Set-Cookie',[cookie('__Host-oidc','',0),cookie('__Host-sid',sid,7*86400)]);res.writeHead(302,{Location:'/?data=real'});res.end();
   } catch {audit('login_denied');json(403,{error:'login_failed'});}return true;
  }
  if(!route.startsWith('/api/')&&route!=='/auth/logout'&&route!=='/admin/users')return false;
  if(route==='/api/ingest/delta'&&req.method==='POST') {
   await collection(req,res,url,json);return true;
  }
  const s=session(req);if(!s)return json(401,{error:'unauthorized'}),true;
  req.auth=s;
  if(write&&!core.csrf(cfg.origin,req.headers.origin,req.headers['x-csrf-token'],s.csrf))return json(403,{error:'csrf'}),true;
  if(route==='/auth/logout'&&req.method==='POST'){tx(t=>t.run('DELETE FROM sessions WHERE id=?',s.id));audit('logout',s.user_id);res.setHeader('Set-Cookie',cookie('__Host-sid','',0));json(200,{ok:true});return true;}
  if(write&&!core.allowed(s.role,'decision'))return json(403,{error:'forbidden'}),true;
  if(route==='/api/me'&&req.method==='GET'){json(200,{email:s.email,person_id:s.person_id,role:s.role,csrf:s.csrf});return true;}
  if(route.startsWith('/api/admin/')||route==='/admin/users') {
   if(s.role!=='admin')return json(403,{error:'forbidden'}),true;
   if(route==='/admin/users'&&req.method==='GET'){res.writeHead(200,{'Content-Type':'text/html; charset=utf-8'});res.end(require('node:fs').readFileSync(require('node:path').join(__dirname,'admin.html')));return true;}
   if(route==='/api/admin/users'&&req.method==='GET'){json(200,tx(t=>t.all('SELECT * FROM users ORDER BY email')));return true;}
   if(route==='/api/admin/users'&&req.method==='POST') {
    const v=await body(req),email=typeof v.email==='string'?v.email.trim().toLowerCase():'';
    if(!/^[^\s@]+@[^\s@]+$/.test(email)||!email.endsWith('@'+env.ALLOWED_DOMAIN.toLowerCase())||!['admin','member','viewer'].includes(v.role)||!['invited','active','disabled'].includes(v.status)||!(v.person_id==null||typeof v.person_id==='string'&&v.person_id.length<=128))return json(400,{error:'invalid_user'}),true;
    if(v.person_id&&!personExists(v.person_id))return json(400,{error:'invalid_person'}),true;
    const ok=tx(t=>{const u=t.get('SELECT * FROM users WHERE email=?',email);if(u?.id===s.user_id&&(v.role!=='admin'||v.status!=='active'))return false;if(u?.role==='admin'&&u.status==='active'&&(v.role!=='admin'||v.status!=='active')&&t.get("SELECT count(*) AS n FROM users WHERE role='admin' AND status='active'").n<=1)return false;if(u){t.run('UPDATE users SET role=?,status=?,person_id=? WHERE id=?',v.role,v.status,v.person_id||null,u.id);t.run('DELETE FROM sessions WHERE user_id=?',u.id);}else t.run('INSERT INTO users(id,email,person_id,role,status,created_at) VALUES (?,?,?,?,?,?)',crypto.randomUUID(),email,v.person_id||null,v.role,v.status,now());return true;});
    if(ok)audit('admin_change',s.user_id);json(ok?200:409,{ok});return true;
   }
   if(route==='/api/admin/ingest-tokens'&&req.method==='GET'){json(200,tx(t=>t.all('SELECT * FROM ingest_tokens')));return true;}
   if(route==='/api/admin/ingest-tokens'&&req.method==='POST'){const v=await body(req);if(v.revoke){const result=tx(t=>t.run('UPDATE ingest_tokens SET revoked_at=? WHERE hash=? AND revoked_at IS NULL',now(),String(v.revoke)));audit('admin_change',s.user_id);json(result.changes?200:404,{ok:!!result.changes});}else {if(typeof v.label!=='string'||!v.label.trim()||v.label.length>100)return json(400,{error:'invalid_label'}),true;const token=random();tx(t=>t.run('INSERT INTO ingest_tokens VALUES (?,?,?,NULL)',hash(token),v.label,now()));audit('admin_change',s.user_id);json(201,{token});}return true;}
   json(404,{error:'not_found'});return true;
  }
  if(req.method==='GET')audit('view',s.user_id);
  return false;
 }
 function personExists(id){try{return JSON.parse(require('node:fs').readFileSync(require('node:path').join(env.DATA_DIR,'real-dataset.json'),'utf8')).persons.some(p=>p.person_id===id);}catch{return false;}}
 function personFor(email){try{const d=JSON.parse(require('node:fs').readFileSync(require('node:path').join(env.DATA_DIR,'real-dataset.json'),'utf8'));const matches=d.persons.filter(p=>[p.email,...(Array.isArray(p.emails)?p.emails:[])].some(e=>typeof e==='string'&&e.toLowerCase()===email));return matches.length===1?matches[0].person_id:null;}catch{return null;}}
 async function collection(req,res,url,json){
  const bearer=/^Bearer ([A-Za-z0-9_-]{20,256})$/.exec(req.headers.authorization||'');
  const digest=bearer?hash(bearer[1]):'';let token=null;
  if(digest){
   if((env.INGEST_TOKEN_HASHES||'').split(',').some(h=>same(h.trim(),digest)))token={role:'admin'};
   const personal=JSON.parse(env.INBOX_TOKEN_HASHES||'{}')[digest];if(personal)token={role:'person',person_id:personal};
   if(!token&&await storage.getToken(digest))token={role:'admin'};
  }
  if(!token)return json(401,{error:'unauthorized'});
  try{const result=await core.collection({action:core.route(req.method,url.pathname),input:req.method==='POST'?await body(req,5*1024*1024):null,since:url.searchParams.get('since'),dryRun:url.searchParams.get('dry_run')==='true',token,storage});await storage.audit('collection','token:'+digest.slice(0,12));return json(result.status,result.data);}catch(e){return json(e.status||500,{error:e.code||'request_failed'});}
 }
 return {handle,session,audit,verify,collection,storage};
}
module.exports={config,createAuth,hash,body};
