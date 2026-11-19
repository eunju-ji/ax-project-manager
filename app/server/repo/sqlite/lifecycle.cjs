const fs=require('node:fs');const path=require('node:path');const {randomUUID}=require('node:crypto');
function gate(file,fn){if(file===':memory:')return fn();const lock=file+'.gate';let fd;try{fd=fs.openSync(lock,'wx');return fn();}finally{if(fd!==undefined){fs.closeSync(fd);fs.unlinkSync(lock);}}}
function leases(file){const dir=file+'.leases';if(!fs.existsSync(dir))return [];return fs.readdirSync(dir).filter(name=>{const pid=Number(name.split('-')[0]);try{process.kill(pid,0);return true;}catch(e){if(e.code!=='ESRCH')return true;fs.unlinkSync(path.join(dir,name));return false;}});}
function acquire(file){if(file===':memory:')return ()=>{};const dir=file+'.leases';fs.mkdirSync(dir,{recursive:true});const name=path.join(dir,process.pid+'-'+randomUUID());fs.writeFileSync(name,'');return ()=>fs.unlinkSync(name);}
module.exports={gate,leases,acquire};
