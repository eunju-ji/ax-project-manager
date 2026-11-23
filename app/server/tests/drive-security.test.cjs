const {test}=require('node:test'),a=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {DriveClient,ACTIVITY_FIELDS}=require('../connectors/drive/client.cjs');
const {splitActivity,FIELDS}=require('../connectors/drive/model.cjs');
const {DriveCollector}=require('../connectors/drive/collect.cjs');
const {DriveStore}=require('../connectors/drive/store.cjs');
const {open}=require('../repo/sqlite/index.cjs');
const {row,WORKSPACE:ws}=require('../repo/sqlite/records.cjs');
// Independently transcribed REST schema subset; not generated from our request masks.
// Source links and inheritance rules: docs/migration/m4-drive-connector-report.md.
const scalar=true,TimeRange={startTime:scalar,endTime:scalar},Actor={user:{knownUser:{personName:scalar}}},Target={driveItem:{name:scalar}},TargetReference={driveItem:{name:scalar},drive:{name:scalar},teamDrive:{name:scalar}};
const Detail={create:{new:{}},edit:{},delete:{type:scalar},rename:{newTitle:scalar},move:{addedParents:TargetReference,removedParents:TargetReference},comment:{post:{subtype:scalar},assignment:{subtype:scalar},suggestion:{subtype:scalar}}};
const Action={detail:Detail,actor:Actor,target:Target,timestamp:scalar,timeRange:TimeRange};
const DriveActivity={primaryActionDetail:Detail,actions:Action,actors:Actor,targets:Target,timestamp:scalar,timeRange:TimeRange};
const File={id:scalar,driveId:scalar,name:scalar,mimeType:scalar,parents:scalar,createdTime:scalar,modifiedTime:scalar,trashed:scalar,lastModifyingUser:{displayName:scalar,emailAddress:scalar,permissionId:scalar}};
function validate(mask,schema){let pos=0;function fields(type,nested=false){while(pos<mask.length){const match=/^[A-Za-z][A-Za-z0-9]*/.exec(mask.slice(pos));if(!match)throw Error('field syntax');const name=match[0];pos+=name.length;if(!Object.hasOwn(type,name))throw Error('unknown field '+name);if(mask[pos]==='('){pos++;fields(type[name],true);}if(mask[pos]===','){pos++;continue;}if(nested&&mask[pos]===')'){pos++;return;}if(pos===mask.length&&!nested)return;throw Error('field syntax');}if(nested)throw Error('missing )');}fields(schema);}
test('official REST fields masks accepted; unknown TargetReference and Files paths return 400',async()=>{
 const schemas={activity:{nextPageToken:scalar,activities:DriveActivity},files:{nextPageToken:scalar,files:File},changes:{nextPageToken:scalar,newStartPageToken:scalar,changes:{fileId:scalar,removed:scalar,file:File}}};
 const calls=[];const client=new DriveClient({driveId:'D',token:async()=>'',fetchImpl:async url=>{calls.push(url);let schema=url.pathname.endsWith('activity:query')?schemas.activity:url.pathname.endsWith('/changes')?schemas.changes:url.pathname.endsWith('/files')?schemas.files:File;try{validate(url.searchParams.get('fields'),schema);return new Response('{}');}catch{return new Response('{}',{status:400});}}});
 await client.activities('2026-11-01','2026-11-02');await client.files();await client.file('F');await client.changes('1');a.equal(calls.length,4);
 await a.rejects(client.request('activity:query',{fields:ACTIVITY_FIELDS.replace('edit','move(addedParents(name)),edit')},{},true),e=>e.status===400);
 await a.rejects(client.request('files/F',{fields:FIELDS+',notAFileField'}),e=>e.status===400);
});
test('action target and actor override activity aggregate; missing values inherit all targets/actors',()=>{
 const activity={actors:[{user:{knownUser:{personName:'people/aggregate'}}}],targets:[{driveItem:{name:'items/F1'}},{driveItem:{name:'items/F2'}}],timestamp:'2026-11-01T00:00:00Z',actions:[{detail:{edit:{}},target:{driveItem:{name:'items/F1'}},actor:{user:{knownUser:{personName:'people/A'}}}},{detail:{rename:{}},target:{driveItem:{name:'items/F2'}},actor:{user:{knownUser:{personName:'people/B'}}}}]};
 const events=splitActivity(activity,'D');a.equal(events.length,2);a.deepEqual(events.map(e=>e.file_id),['F1','F2']);a.deepEqual(events.map(e=>e.actor_external_ids),[['people/A'],['people/B']]);
 a.equal(splitActivity({...activity,actions:[{detail:{edit:{}}}]},'D').length,2);
});
test('activity revalidates cached membership; removed/foreign Changes hide metadata and preserve events',async t=>{
 const db=open(':memory:');t.after(()=>db.close());const store=new DriveStore(db,'D');let file={id:'F',driveId:'D',name:'sensitive title',parents:['D']},calls=0;
 const client={driveId:'D',file:async()=>{calls++;return file;},activities:async()=>({activities:[{primaryActionDetail:{edit:{}},targets:[{driveItem:{name:'items/F'}}],timestamp:'2026-11-01T00:00:00Z'}]})};
 const collector=new DriveCollector(client,store);collector.cache.set('F',file);file={...file,driveId:'OTHER'};await collector.activities('2026-11-01');a.ok(calls>0);a.equal(db.tx(tx=>tx.get('SELECT count(*) n FROM source_events').n),0);
 file={...file,driveId:'D'};await collector.activities('2026-11-01');file={...file,driveId:'OTHER'};
 client.start=async()=>({startPageToken:'1'});client.files=async()=>({files:[]});client.changes=async()=>({changes:[{fileId:'F',file}],newStartPageToken:'2'});await collector.changes();
 a.equal(db.tx(tx=>row(tx,'sources','drive:D:F').availability),'moved');a.ok(!JSON.stringify(store.view()).includes('sensitive title'));a.equal(db.tx(tx=>tx.get('SELECT count(*) n FROM source_events').n),1);a.equal(collector.cache.has('F'),false);
});
test('secure directory checks fail closed, pin persists and rejects mismatches, export refuses escape',t=>{
 const security=require('../connectors/drive/security.cjs'),dir=fs.mkdtempSync(path.join(os.tmpdir(),'ax-safe-'));t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));
 a.throws(()=>security.checkDirs([dir],{inspect:()=>({owner:'OTHER',sid:'ME',protected:true,rules:[]})}),/ACL/);
 a.throws(()=>security.checkDirs([dir],{inspect:()=>({owner:'ME',sid:'ME',protected:true,rules:[{sid:'EVERYONE',allow:true}]})}),/ACL/);
 security.checkDirs([dir],{inspect:()=>({owner:'ME',sid:'ME',protected:true,rules:[{sid:'ME',allow:true}]})});
 // Reviewer F1: another ordinary owner can rewrite the DACL, so it must fail even when only ME is allowed.
 a.throws(()=>security.checkDirs([dir],{inspect:()=>({owner:'S-1-5-21-OTHER',sid:'ME',protected:true,rules:[{sid:'ME',allow:true}]})}),/ACL/);
 for(const trusted of ['S-1-5-32-544','S-1-5-18'])security.checkDirs([dir],{inspect:()=>({owner:trusted,sid:'ME',protected:true,rules:[{sid:'ME',allow:true}]})});
 security.pinDrive(dir,'D');security.pinDrive(dir,'D');a.throws(()=>security.pinDrive(dir,'OTHER'),/drive ID/);
 const db=open(':memory:');t.after(()=>db.close());new DriveStore(db,'D');a.throws(()=>new DriveStore(db,'OTHER'),/drive ID/);
 a.throws(()=>require('../transfer.cjs').exportBundle(db,path.join(dir,'escape.jsonl')),/pilot/);
});
test('OAuth callback consumed once, malformed/wrong state tolerated, timeout and refresh are masked',async t=>{
 const {OAuth,SCOPES}=require('../connectors/drive/oauth.cjs');const dir=fs.mkdtempSync(path.join(os.tmpdir(),'ax-oauth-'));t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));
 fs.writeFileSync(path.join(dir,'oauth-client.json'),JSON.stringify({installed:{client_id:'fake',client_secret:'fake'}}));let exchanges=0;
 const oauth=new OAuth(dir,{timeoutMs:1000,fetchImpl:async()=>{exchanges++;return new Response(JSON.stringify({access_token:'fake',refresh_token:'fake-refresh',scope:SCOPES.join(' '),expires_in:3600}));}});
 await oauth.auth(async url=>{const u=new URL(url),cb=new URL(u.searchParams.get('redirect_uri'));cb.search=new URLSearchParams({state:'bad',code:'bad'}).toString();a.equal((await fetch(cb)).status,400);cb.search=new URLSearchParams({state:u.searchParams.get('state'),code:'fake'}).toString();a.equal((await fetch(cb)).status,200);});a.equal(exchanges,1);
 oauth.timeoutMs=20;await a.rejects(oauth.auth(()=>{}),/timed out/);
 const token=JSON.parse(fs.readFileSync(path.join(dir,'token.json')));token.expires_at=0;fs.writeFileSync(path.join(dir,'token.json'),JSON.stringify(token));a.equal(await oauth.token(),'fake');
 fs.writeFileSync(path.join(dir,'token.json'),JSON.stringify(token));oauth.fetch=async()=>{throw Error('secret-body');};await a.rejects(oauth.token(),e=>e.message==='OAuth token exchange failed');
});
test('Windows protected dirs contain token temp, SQLite WAL/SHM, audit spool and backup',async t=>{
 const security=require('../connectors/drive/security.cjs'),dir=fs.mkdtempSync(path.join(os.tmpdir(),'ax-acl-'));t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));
 const secrets=path.join(dir,'.secrets'),pilot=path.join(dir,'.pilot');security.secureDirs([secrets,pilot]);
 const {OAuth,SCOPES}=require('../connectors/drive/oauth.cjs');fs.writeFileSync(path.join(secrets,'token.json'),JSON.stringify({scope:SCOPES.join(' '),refresh_token:'fake',expires_at:0}));
 const oauth=new OAuth(secrets,{fetchImpl:async()=>new Response(JSON.stringify({access_token:'fake',expires_in:3600}))});oauth.client=()=>({client_id:'fake',client_secret:'fake'});await oauth.token();a.ok(fs.existsSync(path.join(secrets,'token.json')));a.ok(!fs.existsSync(path.join(secrets,'token.json.tmp')));
 const file=path.join(pilot,'test.sqlite'),db=open(file);try{new DriveStore(db,'D');a.ok(fs.existsSync(file+'-wal'));a.ok(fs.existsSync(file+'-shm'));require('../service/audit-spool.cjs').enqueue(db,{key:'test',values:{}});await db.backup(path.join(pilot,'backup.sqlite'));security.checkDirs([secrets,pilot]);a.ok(fs.existsSync(file+'.audit-pending'));a.ok(fs.existsSync(path.join(pilot,'backup.sqlite')));}finally{db.close();}
});
