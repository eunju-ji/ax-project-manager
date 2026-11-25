import {bytes} from './crypto.js';
/** Access Identity: signature verification always precedes invitation lookup. */
export function createIdentity(env,storage,{fetch:fetcher=globalThis.fetch,jwks,now=Date.now}={}){
 let keys=jwks,keysAt=0;const imported=new Map();
 const team=String(env.ACCESS_TEAM_DOMAIN||'').replace(/^https:\/\//,'').replace(/\/$/,'');
 if(!/^[a-z0-9-]+\.cloudflareaccess\.com$/.test(team)||!env.ACCESS_AUD)throw Error('access_configuration');
 const issuer='https://'+team;
 async function load(){const r=await fetcher(issuer+'/cdn-cgi/access/certs',{redirect:'error',signal:AbortSignal.timeout(10000)});if(!r.ok)throw Error();keys=await r.json();keysAt=now();imported.clear();}
 return {async identify(req){try{
  const token=req.headers.get('Cf-Access-Jwt-Assertion');if(!token||token.length>20000)return null;
  const parts=token.split('.');if(parts.length!==3||parts.some(p=>!p||!/^[A-Za-z0-9_-]+$/.test(p)))return null;
  const [a,b,c]=parts,header=JSON.parse(new TextDecoder().decode(bytes(a))),claims=JSON.parse(new TextDecoder().decode(bytes(b)));
  if(header.alg!=='RS256'||typeof header.kid!=='string')return null;
  if(!keys||!jwks&&now()-keysAt>3600000)await load();
  const find=()=>keys.keys.find(k=>k.kid===header.kid&&k.kty==='RSA'&&(!k.use||k.use==='sig')&&(!k.alg||k.alg==='RS256'));
  let key=find();if(!key&&!jwks&&now()-keysAt>=60000){await load();key=find();}if(!key)return null;
  let publicKey=imported.get(header.kid);if(!publicKey){publicKey=await crypto.subtle.importKey('jwk',key,{name:'RSASSA-PKCS1-v1_5',hash:'SHA-256'},false,['verify']);imported.set(header.kid,publicKey);}
  if(!await crypto.subtle.verify('RSASSA-PKCS1-v1_5',publicKey,bytes(c),new TextEncoder().encode(a+'.'+b)))return null;
  if(claims.iss!==issuer||!(Array.isArray(claims.aud)?claims.aud:[claims.aud]).includes(env.ACCESS_AUD)||!Number.isFinite(claims.exp)||claims.exp*1000<=now()||claims.nbf!==undefined&&(!Number.isFinite(claims.nbf)||claims.nbf*1000>now())||typeof claims.email!=='string')return null;
  const email=claims.email.toLowerCase();let user=await storage.getUser(email);
  // Bootstrap is explicit; an existing disabled account is never reactivated by config.
  if(!user&&(env.ADMIN_EMAILS||'').split(',').map(e=>e.trim().toLowerCase()).includes(email)){user={id:email,email,role:'admin',status:'active'};await storage.saveUser(user);}
  return user&&['active','invited'].includes(user.status)?user:null;
 }catch{return null;}}};
}
