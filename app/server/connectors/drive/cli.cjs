const path=require('node:path');const fs=require('node:fs');const {OAuth,checkScopes}=require('./oauth.cjs');const {DriveClient}=require('./client.cjs');const {DriveStore}=require('./store.cjs');const {DriveCollector}=require('./collect.cjs');const {open}=require('../../repo/sqlite/index.cjs');
const PILOT_FILE=path.join(__dirname,'../../.pilot/pilot.sqlite');
async function main(){const [command,...args]=process.argv.slice(2),oauth=new OAuth();
 const security=require('./security.cjs');
 if(command==='auto-classify'){
  security.checkDirs([security.PILOT_DIR]);security.pinDrive(security.PILOT_DIR,process.env.AX_DRIVE_ID);
  if(!fs.existsSync(PILOT_FILE))throw Error('Pilot DB does not exist');
  const [action,file,...flags]=args;if(!['extract','apply','revert'].includes(action)||action==='extract'&&args.length!==1||action==='apply'&&(!file||flags.some(f=>f!=='--dry-run')||flags.length>1)||action==='revert'&&args.length!==2)throw Error('usage: drive:auto-classify -- extract | apply <json> [--dry-run] | revert <result-id>');
  const db=open(PILOT_FILE);try{const store=new DriveStore(db,process.env.AX_DRIVE_ID),c=require('./classify.cjs'),files=require('./classify-files.cjs');const value=action==='extract'?files.write(store):action==='apply'?c.apply(store,files.read(file),{dryRun:flags.includes('--dry-run'),threshold:process.env.AX_CLASSIFY_THRESHOLD===undefined?.8:Number(process.env.AX_CLASSIFY_THRESHOLD)}):c.revert(store,file);console.log(JSON.stringify(value,null,2));}finally{db.close();}return;
 }
 if(command==='secure-dirs'){security.secureDirs();console.log('Protected directories ready');return;}
 if(command==='check-dirs'){security.checkDirs();console.log('Directory ACL verified');return;}
 if(['auth','collect','structure-draft','structure-import','rematch'].includes(command))security.checkDirs();
 if(command==='import')security.checkDirs([security.PILOT_DIR]);
 if(['auth','check','collect','import','metrics','structure-draft','structure-import','rematch'].includes(command))security.pinDrive(security.PILOT_DIR,process.env.AX_DRIVE_ID);
 if(command==='auth')return oauth.auth(url=>{ // Browser gets the consent URL; it is never logged.
  const {spawn}=require('node:child_process');const child=spawn('rundll32.exe',['url.dll,FileProtocolHandler',url],{windowsHide:true,stdio:'ignore'});child.on('error',()=>{});console.log('브라우저에서 Google 동의를 완료하세요.');
 });
 const driveId=process.env.AX_DRIVE_ID;if(!driveId)throw Error('Set AX_DRIVE_ID to the AX-TF shared drive ID');
 if(command==='import'){
  if(args.length<1||args.length>2||(args[1]&&args[1]!=='--keep'))throw Error('usage: drive:import -- <json> [--keep]');
  const db=open(PILOT_FILE);try{console.log(JSON.stringify(await require('./import.cjs').importFile(db,driveId,args[0],{keep:args[1]==='--keep'}),null,2));}finally{db.close();}return;
 }
 if(['structure-draft','structure-import','rematch'].includes(command)){
  if(!fs.existsSync(PILOT_FILE))throw Error('Pilot DB does not exist; run drive:collect first');
  const db=open(PILOT_FILE);try{const store=new DriveStore(db,driveId),structure=require('./structure.cjs');
   if(command==='structure-draft'){if(args.length)throw Error('usage: drive:structure-draft');const file=path.join(path.dirname(PILOT_FILE),'structure-draft.csv');fs.writeFileSync(file,structure.encode(structure.draft(store)),{encoding:'utf8',mode:0o600,flag:'wx'});console.log(file);}
   else if(command==='structure-import'){if(args.length!==1)throw Error('usage: drive:structure-import -- <csv>');console.log(JSON.stringify(structure.importCsv(store,structure.readCsv(args[0])),null,2));}
   else console.log(JSON.stringify({proposals:structure.rematch(store)}));
  }finally{db.close();}return;
 }
 if(command==='metrics'){if(!fs.existsSync(PILOT_FILE))throw Error('Pilot DB does not exist');const db=open(PILOT_FILE);try{console.log(JSON.stringify(new DriveStore(db,driveId).metrics(),null,2));}finally{db.close();}return;}
 const client=new DriveClient({driveId,token:()=>oauth.token()});checkScopes(oauth.read().scope);const drive=await client.check();if(drive.id!==driveId)throw Error('Configured drive ID mismatch');console.log('공유 드라이브 루트 확인: '+drive.name+' (이름은 참고용, 고정된 ID로 확인)');
 if(command==='check'){console.log('인증·두 스코프·AX-TF 접근 확인 완료 (수집 저장 없음)');return;}
 if(command!=='collect')throw Error('Unknown Drive command');let since=new Date(Date.now()-14*86400000).toISOString();if(args.length){if(args.length!==2||args[0]!=='--since'||!Number.isFinite(Date.parse(args[1])))throw Error('usage: drive:collect -- --since YYYY-MM-DD');since=new Date(args[1]).toISOString();}
 fs.mkdirSync(path.dirname(PILOT_FILE),{recursive:true});const db=open(PILOT_FILE);try{require('../../service/audit-spool.cjs').drain(db);await new DriveCollector(client,new DriveStore(db,driveId)).collect(since);console.log('AX-TF 메타데이터·활동 수집 완료');}finally{db.close();}
}
if(require.main===module)main().catch(()=>{console.error('Drive 작업 실패. 로컬 설정·동의·접근 권한을 확인하세요.');process.exitCode=1;});
module.exports={PILOT_FILE};
