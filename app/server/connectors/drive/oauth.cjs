const fs=require('node:fs');const path=require('node:path');const http=require('node:http');const crypto=require('node:crypto');
const SCOPES=['https://www.googleapis.com/auth/drive.metadata.readonly','https://www.googleapis.com/auth/drive.activity.readonly'];
function checkScopes(scope){const actual=new Set((scope||'').split(' ').filter(Boolean));if(actual.size!==2||SCOPES.some(s=>!actual.has(s)))throw Error('OAuth scope mismatch; authorize exactly the two pilot scopes');}
function save(file,data){fs.mkdirSync(path.dirname(file),{recursive:true});const tmp=file+'.tmp';fs.writeFileSync(tmp,JSON.stringify(data),{encoding:'utf8',mode:0o600});fs.renameSync(tmp,file);}
function pkce(){const verifier=crypto.randomBytes(32).toString('base64url');return {verifier,challenge:crypto.createHash('sha256').update(verifier).digest('base64url'),state:crypto.randomBytes(32).toString('base64url')};}
class OAuth{
 constructor(dir=path.join(__dirname,'../../../.secrets'),{fetchImpl=fetch,tokenUrl='https://oauth2.googleapis.com/token',timeoutMs=180000}={}){this.dir=dir;this.fetch=fetchImpl;this.tokenUrl=tokenUrl;this.timeoutMs=timeoutMs;}
 client(){try{const c=JSON.parse(fs.readFileSync(path.join(this.dir,'oauth-client.json'),'utf8')).installed;if(!c?.client_id||!c.client_secret)throw Error();return c;}catch{throw Error('Desktop OAuth client file missing or invalid');}}
 read(){try{return JSON.parse(fs.readFileSync(path.join(this.dir,'token.json'),'utf8'));}catch{throw Error('Run drive:auth first');}}
 async exchange(params){const c=this.client();let r;try{r=await this.fetch(this.tokenUrl,{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({client_id:c.client_id,client_secret:c.client_secret,...params}),redirect:'error',signal:AbortSignal.timeout(30000)});if(!r.ok)throw Error();return await r.json();}catch{throw Error('OAuth token exchange failed');}}
 async token(){const old=this.read();checkScopes(old.scope);if(old.expires_at>Date.now()+60000)return old.access_token;const next=await this.exchange({grant_type:'refresh_token',refresh_token:old.refresh_token});checkScopes(next.scope||old.scope);const saved={...old,...next,expires_at:Date.now()+next.expires_in*1000};save(path.join(this.dir,'token.json'),saved);return saved.access_token;}
 async auth(show){const c=this.client(),p=pkce();let timer;const server=http.createServer();
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));const redirect=`http://127.0.0.1:${server.address().port}/callback`;
  let consumed=false;
  const result=new Promise((resolve,reject)=>{timer=setTimeout(()=>{consumed=true;server.close();reject(Error('OAuth consent timed out'));},this.timeoutMs);server.on('request',(req,res)=>{let u;try{u=new URL(req.url,redirect);}catch{res.writeHead(400);res.end('Invalid callback');return;}if(consumed||u.pathname!=='/callback'||u.searchParams.get('state')!==p.state){res.writeHead(400);res.end('Invalid callback');return;}consumed=true;clearTimeout(timer);if(!u.searchParams.get('code')){res.end('Consent declined');reject(Error('OAuth consent declined'));return;}res.end('Consent received. Return to terminal.');resolve(u.searchParams.get('code'));});});
  result.catch(()=>{});
  const url=new URL('https://accounts.google.com/o/oauth2/v2/auth');url.search=new URLSearchParams({client_id:c.client_id,redirect_uri:redirect,response_type:'code',scope:SCOPES.join(' '),access_type:'offline',prompt:'consent',code_challenge:p.challenge,code_challenge_method:'S256',state:p.state}).toString();
  try{await show(url.href);const code=await result;const t=await this.exchange({grant_type:'authorization_code',code,redirect_uri:redirect,code_verifier:p.verifier});checkScopes(t.scope);if(!t.refresh_token)throw Error('OAuth refresh token missing');save(path.join(this.dir,'token.json'),{...t,expires_at:Date.now()+t.expires_in*1000});}finally{clearTimeout(timer);server.close();}
 }
}
module.exports={OAuth,SCOPES,checkScopes,pkce};
