'use strict';
const {test}=require('node:test'),a=require('node:assert/strict'),crypto=require('node:crypto'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {createServer}=require('../api/server.cjs'),{config,hash}=require('../api/auth.cjs');
const pair=crypto.generateKeyPairSync('rsa',{modulusLength:2048}),wrong=crypto.generateKeyPairSync('rsa',{modulusLength:2048});
const key={...pair.publicKey.export({format:'jwk'}),kid:'test',alg:'RS256'};
async function fixture(t,envOverrides={}){
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'ax-auth-'));let time=Date.now(),claims={},nonce='',badSignature=false,algorithm='RS256',exchange;
 fs.writeFileSync(path.join(dir,'real-dataset.json'),JSON.stringify({persons:[{person_id:'P1',display_name:'합성'}],projects:[],tasks:[],worklogs:[],sources:[],links:[],history:[]}));
 const env={AUTH_MODE:'oidc',DATA_DIR:dir,PUBLIC_BASE_URL:'https://ax.example.test',OAUTH_REDIRECT_URI:'https://ax.example.test/auth/callback',OAUTH_CLIENT_ID:'client',OAUTH_CLIENT_SECRET:'never-print',ALLOWED_DOMAIN:'example.test',ADMIN_EMAILS:'admin@example.test',SESSION_SECRET:'x'.repeat(32)};
 Object.assign(env,envOverrides);
 const local=createServer({dir,env,authDependencies:{now:()=>time,jwks:{keys:[key]},fetch:async(url,opts)=>{if(url.endsWith('openid-configuration'))return {ok:true,json:async()=>({issuer:'https://accounts.google.com',authorization_endpoint:'https://idp.example.test/auth',token_endpoint:'https://idp.example.test/token',jwks_uri:'https://idp.example.test/keys'})};exchange=opts.body;const h=Buffer.from(JSON.stringify({alg:algorithm,kid:'test'})).toString('base64url'),p=Buffer.from(JSON.stringify({iss:'https://accounts.google.com',aud:'client',sub:'test-user',iat:Math.floor(time/1000),exp:Math.floor(time/1000)+3600,email:'admin@example.test',email_verified:true,hd:'example.test',nonce,...claims})).toString('base64url');return {ok:true,json:async()=>({id_token:h+'.'+p+'.'+(algorithm==='none'?'':algorithm==='HS256'?crypto.createHmac('sha256',pair.publicKey.export({type:'spki',format:'pem'})).update(h+'.'+p).digest('base64url'):crypto.sign('RSA-SHA256',Buffer.from(h+'.'+p),badSignature?wrong.privateKey:pair.privateKey).toString('base64url'))})};}}});
 await new Promise(r=>local.server.listen(0,'127.0.0.1',r));t.after(()=>new Promise(r=>local.server.close(()=>{fs.rmSync(dir,{recursive:true,force:true});r();})));
 const request=(url,options={})=>new Promise((resolve,reject)=>{const r=require('node:http').request({host:'127.0.0.1',port:local.server.address().port,path:url,method:options.method||'GET',headers:{Host:'ax.example.test',...options.headers}},res=>{const chunks=[];res.on('data',c=>chunks.push(c));res.on('end',()=>{const h=new Headers();for(let i=0;i<res.rawHeaders.length;i+=2)h.append(res.rawHeaders[i],res.rawHeaders[i+1]);resolve(new Response(Buffer.concat(chunks),{status:res.statusCode,headers:h}));});});r.on('error',reject);r.end(options.body);});
 async function login(changes={},state='valid',signature=false,alg='RS256'){claims=changes;badSignature=signature;algorithm=alg;const start=await request('/auth/login'),u=new URL(start.headers.get('location'));nonce=u.searchParams.get('nonce');const cookie=start.headers.getSetCookie()[0].split(';')[0];const response=await request('/auth/callback?code=code&state='+encodeURIComponent(state==='valid'?u.searchParams.get('state'):state),{headers:{Cookie:cookie}});return {response,u,cookie,sid:response.headers.getSetCookie().find(c=>c.startsWith('__Host-sid='))?.split(';')[0]};}
 async function session(email,role='viewer',status='invited'){local.db.tx(tx=>tx.run('INSERT INTO users(id,email,role,status,created_at) VALUES (?,?,?,?,?)',email,email,role,status,time));const l=await login({email});if(status==='disabled')return l;const me=await request('/api/me',{headers:{Cookie:l.sid}});return {...l,me:await me.json()};}
 return {...local,dir,env,request,login,session,advance:n=>{time+=n;},exchange:()=>exchange};
}
test('configuration fails closed outside loopback and lists missing names only',()=>{a.throws(()=>config({AUTH_MODE:'off'},'0.0.0.0'));a.throws(()=>config({AUTH_MODE:'oidc'}),/OAUTH_CLIENT_ID/);a.equal(config({AUTH_MODE:'off'},'localhost').mode,'off');});
for(const [name,claims,state,bad] of [
 ['domain',{hd:'other.test'}],['uninvited',{email:'stranger@example.test'}],['nonce',{nonce:'wrong'}],['state',{},'wrong'],['expired',{exp:1}],['signature',{},'valid',true],['issuer',{iss:'https://evil.test'}],['audience',{aud:'other'}],['unverified',{email_verified:false}],['authorized-party',{azp:'other'}]
])test('OIDC rejects '+name,async t=>{const f=await fixture(t);const {response}=await f.login(claims,state,bad);a.equal(response.status,403);a.equal(f.db.tx(tx=>tx.get('SELECT count(*) n FROM sessions')).n,0);});
test('disabled invited user cannot log in',async t=>{const f=await fixture(t);a.equal((await f.session('disabled@example.test','viewer','disabled')).response.status,403);});
for(const alg of ['HS256','none'])test('OIDC rejects algorithm-substitution '+alg,async t=>{const f=await fixture(t),l=await f.login({},'valid',false,alg);a.equal(l.response.status,403);a.equal(f.db.tx(tx=>tx.get('SELECT count(*) n FROM sessions')).n,0);});
test('viewer logout requires CSRF and revokes session without write permission',async t=>{
 const f=await fixture(t),s=await f.session('logout@example.test','viewer'),headers={Cookie:s.sid,Origin:f.env.PUBLIC_BASE_URL,'X-CSRF-Token':s.me.csrf};
 a.equal((await f.request('/auth/logout',{method:'POST',headers:{Cookie:s.sid,Origin:f.env.PUBLIC_BASE_URL}})).status,403);
 a.equal((await f.request('/auth/logout',{method:'POST',headers:{...headers,Origin:'https://evil.test'}})).status,403);
 a.equal((await f.request('/auth/logout',{method:'POST',headers})).status,200);
 a.equal((await f.request('/api/me',{headers:{Cookie:s.sid}})).status,401);
});
test('canonical static routes never bypass production data or login boundaries',async t=>{
 const f=await fixture(t);
 for(const route of ['/%64ata.js','/DATA.JS','//data.js','/%44ATA.js','//%64ata.js']){const r=await f.request(route);a.equal(r.status,200,route);a.match(await r.text(),/projects:\[\]/,route);}
 for(const route of ['/%69ndex.html','/INDEX.HTML','//index.html','//%49NDEX.html']){const r=await f.request(route);a.equal(r.status,200,route);a.match(await r.text(),/href="\/auth\/login"/,route);}
 for(const route of ['/.real/real-dataset.json','/%2ereal/real-dataset.json','/.REAL/real-dataset.json','//.real//real-dataset.json','/%252ereal/real-dataset.json'])a.equal((await f.request(route)).status,404,route);
 for(const route of ['/%','/%ff','/%2e%2e/data.js','/a/../data.js','/a/%2e%2e/data.js','/a%5cdata.js','/data.js%00'])a.equal((await f.request(route)).status,400,route);
 const l=await f.login();const r=await f.request('/%69ndex.html',{headers:{Cookie:l.sid}});a.equal(r.status,302);a.equal(r.headers.get('location'),'/?data=real');
});
test('trusted proxy isolates client limits and splits login and callback budgets',async t=>{
 const f=await fixture(t,{TRUSTED_PROXIES:'127.0.0.1/32,10.0.0.0/8'});
 const request=(route,xff)=>f.request(route,{headers:{'X-Forwarded-For':xff}});
 for(let i=0;i<20;i++)a.equal((await request('/auth/login','198.51.100.10, 10.2.3.4')).status,302);
 a.equal((await request('/auth/login','198.51.100.10, 10.2.3.4')).status,429);
 a.equal((await request('/auth/login','198.51.100.11, 10.2.3.4')).status,302);
 a.equal((await request('/auth/login','203.0.113.99, 198.51.100.10, 10.2.3.4')).status,429);
 for(let i=0;i<20;i++)a.equal((await request('/auth/callback','198.51.100.10, 10.2.3.4')).status,403);
 a.equal((await request('/auth/callback','198.51.100.10, 10.2.3.4')).status,429);
 a.equal((await request('/auth/callback','198.51.100.11, 10.2.3.4')).status,403);
 f.advance(60000);a.equal((await request('/auth/login','198.51.100.10, 10.2.3.4')).status,302);
});
test('untrusted peer ignores spoofed forwarding headers',async t=>{
 const f=await fixture(t,{TRUSTED_PROXIES:'10.0.0.0/8'});
 for(let i=0;i<20;i++)a.equal((await f.request('/auth/login',{headers:{'X-Forwarded-For':'198.51.100.'+i}})).status,302);
 a.equal((await f.request('/auth/login',{headers:{'X-Forwarded-For':'203.0.113.1'}})).status,429);
});
test('proxy CIDRs support IPv6, mapped IPv4 and fail closed on malformed chains',()=>{
 const {clientIP,trustedProxies,canonicalIP}=require('../api/client-ip.cjs');
 const trusted=trustedProxies('127.0.0.1,10.0.0.0/8,2001:db8:1::/48');
 const req=(peer,xff)=>({socket:{remoteAddress:peer},headers:{'x-forwarded-for':xff}});
 a.equal(clientIP(req('::ffff:127.0.0.1','198.51.100.5, 10.2.3.4'),trusted),'198.51.100.5');
 a.equal(clientIP(req('2001:db8:1::1','2001:db8:2::5, 2001:db8:1::2'),trusted),'2001:db8:2::5');
 a.equal(clientIP(req('127.0.0.1','198.51.100.5, invalid'),trusted),'127.0.0.1');
 a.equal(clientIP(req('127.0.0.1','198.51.100.5, 203.0.113.7'),trusted),'203.0.113.7');
 a.equal(clientIP(req('127.0.0.1','198.51.100.5'),trustedProxies()),'127.0.0.1');
 a.equal(canonicalIP('2001:0db8:0002:0:0:0:0:5'),'2001:db8:2::5');
 for(const value of ['proxy.local','127.0.0.1/33','::1/129','127.0.0.1/','127.0.0.1,'])a.throws(()=>trustedProxies(value),/^Error: TRUSTED_PROXIES$/);
});
test('signed login uses PKCE, secure hashed session, real-only mode, CSRF and logout',async t=>{const f=await fixture(t),l=await f.login();a.equal(l.response.status,302);a.equal(l.u.searchParams.get('code_challenge_method'),'S256');a.equal(crypto.createHash('sha256').update(f.exchange().get('code_verifier')).digest('base64url'),l.u.searchParams.get('code_challenge'));a.match(l.response.headers.getSetCookie().join(';'),/HttpOnly; Secure; SameSite=Lax/);const headers={Cookie:l.sid};const me=await (await f.request('/api/me',{headers})).json();a.equal(me.role,'admin');a.equal(f.db.tx(tx=>tx.get('SELECT id FROM sessions')).id,hash(l.sid.split('=')[1]));a.equal((await f.request('/api/view',{headers})).status,403);a.equal((await f.request('/api/view?data=real',{headers})).status,200);a.equal((await f.request('/api/decision?data=real',{method:'POST',headers})).status,403);a.equal((await f.request('/auth/logout',{method:'POST',headers:{...headers,Origin:f.env.PUBLIC_BASE_URL,'X-CSRF-Token':me.csrf}})).status,200);a.equal((await f.request('/api/me',{headers})).status,401);a.ok(f.db.tx(tx=>tx.all('SELECT action FROM access_audit')).some(r=>r.action==='logout'));});
for(const [name,advance] of [['idle',12*3600000],['absolute',7*86400000]])test('session expires at '+name+' limit',async t=>{const f=await fixture(t),l=await f.login();f.advance(advance);a.equal((await f.request('/api/me',{headers:{Cookie:l.sid}})).status,401);});
test('viewer denied writes; member decisions reach input validation; admin routes isolated',async t=>{const f=await fixture(t);for(const role of ['viewer','member']){const s=await f.session(role+'@example.test',role),headers={Cookie:s.sid,Origin:f.env.PUBLIC_BASE_URL,'X-CSRF-Token':s.me.csrf,'Content-Type':'application/json'};a.equal((await f.request('/api/decision?data=real',{method:'POST',headers,body:'{}'})).status,role==='viewer'?403:400);a.equal((await f.request('/api/admin/users',{headers})).status,403);a.equal((await f.request('/admin/users',{headers})).status,403);}});
test('admin invite, person link, self protection, session revocation and ingest lifecycle',async t=>{const f=await fixture(t),l=await f.login(),me=await (await f.request('/api/me',{headers:{Cookie:l.sid}})).json(),headers={Cookie:l.sid,Origin:f.env.PUBLIC_BASE_URL,'X-CSRF-Token':me.csrf,'Content-Type':'application/json'};
 const post=(url,data,h=headers)=>f.request(url,{method:'POST',headers:h,body:JSON.stringify(data)});
 a.equal((await post('/api/admin/users',{email:'admin@example.test',role:'viewer',status:'active'})).status,409);
 a.equal((await post('/api/admin/users',{email:'new@example.test',role:'member',status:'invited',person_id:'invalid'})).status,400);
 a.equal((await post('/api/admin/users',{email:'new@example.test',role:'member',status:'invited',person_id:'P1'})).status,200);
 const invited=await f.login({email:'new@example.test'});a.equal(invited.response.status,302);
 a.equal((await post('/api/admin/users',{email:'new@example.test',role:'member',status:'disabled'})).status,200);
 a.equal((await f.request('/api/me',{headers:{Cookie:invited.sid}})).status,401);
 a.equal((await post('/api/admin/users',{}, {...headers,Origin:'https://evil.test'})).status,403);
 const issued=await post('/api/admin/ingest-tokens',{label:'합성 수집'});a.equal(issued.status,201);const {token}=await issued.json(),digest=hash(token);a.equal(f.db.tx(tx=>tx.get('SELECT hash FROM ingest_tokens')).hash,digest);
 const delta={run_id:'test',collected_at:new Date().toISOString(),persons:[],projects:[],tasks:[],sources:[],worklogs:[],links:[]};
 const ingest=tok=>post('/api/ingest/delta?dry_run=true',delta,{'Content-Type':'application/json',Authorization:'Bearer '+tok});
 a.equal((await ingest('invalid')).status,401);const result=await ingest(token);a.equal(result.status,200);a.deepEqual(Object.keys(await result.json()).sort(),['added','ignored','ok','rejected','removed','updated']);
 a.equal((await post('/api/admin/ingest-tokens',{revoke:digest})).status,200);a.equal((await ingest(token)).status,401);
});
test('login rate limiter, cookie state consumption and static data isolation',async t=>{const f=await fixture(t);const l=await f.login();a.equal((await f.request('/auth/callback?code=code&state='+l.u.searchParams.get('state'),{headers:{Cookie:l.cookie}})).status,403);a.equal((await f.request('/api/me')).status,401);const r=await f.request('/data.js');a.match(await r.text(),/projects:\[\]/);a.ok(r.headers.get('strict-transport-security'));let last;for(let i=0;i<21;i++)last=await f.request('/auth/login');a.equal(last.status,429);});
test('environment ingest token, size limit, persistent apply, replay and push transport',async t=>{
 const f=await fixture(t),token='synthetic-token-value-12345';f.env.INGEST_TOKEN_HASHES=hash(token);
 const headers={'Content-Type':'application/json',Authorization:'Bearer '+token};
 a.equal((await f.request('/api/ingest/delta',{method:'POST',headers,body:JSON.stringify({padding:'x'.repeat(5*1024*1024)})})).status,413);
 const delta={run_id:'transport-test',collected_at:new Date().toISOString(),persons:[],projects:[],tasks:[],worklogs:[],sources:[],links:[]};
 const post=()=>f.request('/api/ingest/delta',{method:'POST',headers,body:JSON.stringify(delta)});
 a.equal((await post()).status,200);a.ok(fs.existsSync(path.join(f.dir,'state.json')));a.equal((await post()).status,200);
 const file=path.join(f.dir,'synthetic-delta.json');fs.writeFileSync(file,JSON.stringify(delta));const {pushDelta}=require('../real/push-delta.cjs');
 const summary=await pushDelta(file,'https://ax.example.test',{token,fetch:async(url,options)=>{a.equal(options.redirect,'error');a.equal(options.headers.Authorization,'Bearer '+token);return {ok:true,json:async()=>({ok:true,added:0,token:'remote-secret'})};}});a.deepEqual(summary,{ok:true,added:0,updated:undefined,removed:undefined,ignored:undefined,rejected:undefined});
 await a.rejects(pushDelta(file,'http://ax.example.test',{token}));await a.rejects(pushDelta(file,'https://ax.example.test',{token,fetch:async()=>({ok:false})}),/ingest_failed/);
});
test('browser shows login label and admin invitation and role change with CSP',async t=>{
 const f=await fixture(t),{chromium}=require('@playwright/test'),browser=await chromium.launch({headless:true});t.after(()=>browser.close());
 const context=await browser.newContext();
 await context.route('**/*',async route=>{const req=route.request(),u=new URL(req.url());if(u.origin!==f.env.PUBLIC_BASE_URL)return route.abort();const headers={...req.headers()};delete headers['content-length'];const r=await f.request(u.pathname+u.search,{method:req.method(),headers,body:req.postData()||undefined});await route.fulfill({status:r.status,headers:Object.fromEntries(r.headers),body:Buffer.from(await r.arrayBuffer())});});
 const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));await page.goto(f.env.PUBLIC_BASE_URL);a.equal(await page.getByRole('link',{name:'Google 계정으로 로그인'}).count(),1);
 const login=await f.login(),sid=login.sid.slice('__Host-sid='.length);await context.addCookies([{name:'__Host-sid',value:sid,url:f.env.PUBLIC_BASE_URL,secure:true,httpOnly:true,sameSite:'Lax'}]);
 await page.goto(f.env.PUBLIC_BASE_URL+'/admin/users');await page.locator('#users tr').waitFor();await page.locator('#invite [name=email]').fill('browser@example.test');await page.locator('#invite [name=role]').selectOption('member');await page.getByRole('button',{name:'초대',exact:true}).click();await page.getByRole('cell',{name:'browser@example.test',exact:true}).waitFor();const row=page.locator('#users tr').filter({hasText:'browser@example.test'});await row.getByRole('combobox',{name:'browser@example.test 역할'}).selectOption('viewer');await row.getByRole('button',{name:'저장',exact:true}).click();await page.waitForFunction(()=>document.querySelector('output').textContent==='저장됨');a.equal(f.db.tx(tx=>tx.get('SELECT role FROM users WHERE email=?','browser@example.test')).role,'viewer');await page.goto(f.env.PUBLIC_BASE_URL+'/?data=real');await page.getByRole('link',{name:'\uC0AC\uC6A9\uC790 \uAD00\uB9AC',exact:true}).waitFor();await page.getByRole('button',{name:'\uB85C\uADF8\uC544\uC6C3',exact:true}).click();await page.getByRole('link',{name:'Google \uACC4\uC815\uC73C\uB85C \uB85C\uADF8\uC778'}).waitFor();a.deepEqual(errors,[]);
});
