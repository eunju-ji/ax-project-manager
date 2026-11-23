const fs=require('node:fs'),path=require('node:path'),{execFileSync}=require('node:child_process');
const PILOT_DIR=path.resolve(__dirname,'../../.pilot'),SECRET_DIR=path.resolve(__dirname,'../../../.secrets');
function ps(script){return execFileSync('powershell.exe',['-NoProfile','-NonInteractive','-EncodedCommand',Buffer.from(script,'utf16le').toString('base64')],{encoding:'utf8',windowsHide:true}).trim();}
const literal=s=>"'"+s.replace(/'/g,"''")+"'";
function inspect(file){if(process.platform!=='win32')throw Error('Windows ACL check required');return JSON.parse(ps(`$a=Get-Acl -LiteralPath ${literal(file)}; $sid=[System.Security.Principal.WindowsIdentity]::GetCurrent().User.Value; @{sid=$sid;owner=$a.GetOwner([System.Security.Principal.SecurityIdentifier]).Value;protected=$a.AreAccessRulesProtected;rules=@($a.GetAccessRules($true,$true,[System.Security.Principal.SecurityIdentifier])|ForEach-Object {@{sid=$_.IdentityReference.Value;allow=($_.AccessControlType -eq 'Allow')}})}|ConvertTo-Json -Depth 4 -Compress`));}
function checkDirs(dirs=[SECRET_DIR,PILOT_DIR],{inspect:read=inspect}={}){
 for(const dir of dirs){if(!fs.existsSync(dir))throw Error('ACL directory missing; run drive:secure-dirs');
  const visit=(file,root=false)=>{if(fs.lstatSync(file).isSymbolicLink())throw Error('ACL reparse point refused');const acl=read(file);/* Owner must be trusted: the current user, BUILTIN\Administrators or SYSTEM (both can take ownership anyway). Any other owner could rewrite the DACL without admin rights, so stop. We never change owner automatically (needs admin rights). */if(![acl.sid,'S-1-5-32-544','S-1-5-18'].includes(acl.owner)||(root&&!acl.protected)||!acl.rules.some(r=>r.allow&&r.sid===acl.sid)||acl.rules.some(r=>r.allow&&r.sid!==acl.sid))throw Error('ACL too broad; run drive:secure-dirs');if(fs.statSync(file).isDirectory())for(const name of fs.readdirSync(file))visit(path.join(file,name));};visit(dir,true);
 }
}
function secureDirs(dirs=[SECRET_DIR,PILOT_DIR]){if(process.platform!=='win32')throw Error('Windows ACL setup required');const sid=ps('[System.Security.Principal.WindowsIdentity]::GetCurrent().User.Value');
 const run=args=>execFileSync('icacls.exe',args,{stdio:'pipe',windowsHide:true});
 for(const dir of dirs){fs.mkdirSync(dir,{recursive:true});const noLinks=file=>{if(fs.lstatSync(file).isSymbolicLink())throw Error('ACL reparse point refused');if(fs.statSync(file).isDirectory())for(const n of fs.readdirSync(file))noLinks(path.join(file,n));};noLinks(dir);run([dir,'/reset','/Q']);run([dir,'/grant:r',`*${sid}:(OI)(CI)F`,'/Q']);run([dir,'/inheritance:r','/Q']);
  for(const name of fs.readdirSync(dir)){const file=path.join(dir,name);if(fs.lstatSync(file).isSymbolicLink())throw Error('ACL reparse point refused');run([file,'/reset','/T','/Q']);}
 }checkDirs(dirs);
}
function pinDrive(dir,driveId){if(!/^[A-Za-z0-9_-]+$/.test(driveId||''))throw Error('AX-TF drive ID required');const file=path.join(dir,'drive-config.json');if(fs.existsSync(file)){if(JSON.parse(fs.readFileSync(file,'utf8')).driveId!==driveId)throw Error('Pinned drive ID mismatch');}else fs.writeFileSync(file,JSON.stringify({driveId}),{encoding:'utf8',mode:0o600,flag:'wx'});}
function assertPilotPath(file){if(!fs.existsSync(PILOT_DIR))throw Error('export requires protected .pilot directory');const root=fs.realpathSync(PILOT_DIR),parent=fs.realpathSync(path.dirname(path.resolve(file)));if(parent!==root&&!parent.startsWith(root+path.sep))throw Error('export must stay inside .pilot');if(fs.existsSync(file)&&fs.lstatSync(file).isSymbolicLink())throw Error('pilot symlink refused');}
module.exports={PILOT_DIR,SECRET_DIR,checkDirs,secureDirs,pinDrive,assertPilotPath};
