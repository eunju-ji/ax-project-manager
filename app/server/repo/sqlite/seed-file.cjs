const fs=require('node:fs');const {DatabaseSync}=require('node:sqlite');const {digest}=require('../../domain/rules.cjs');const {gate,leases}=require('./lifecycle.cjs');
// Gate prevents another cooperating runtime from opening between lease check and rename.
function prepare(file,data,reset=false){return gate(file,()=>{
 if(!fs.existsSync(file))return;
 const db=new DatabaseSync(file);let old;try{old=db.prepare('SELECT digest FROM seed_manifest').get()?.digest;}catch{}finally{db.close();}
 if(!reset&&old===digest(data))return;
 if(leases(file).length)throw Error('database in use: stop other runtimes before reseeding');
 const check=new DatabaseSync(file);try{check.exec('PRAGMA busy_timeout=1; BEGIN EXCLUSIVE; COMMIT;');const result=check.prepare('PRAGMA wal_checkpoint(TRUNCATE)').get();if(result.busy)throw Error('database in use');}finally{check.close();}
 fs.renameSync(file,file+'.previous-'+Date.now());
 });}
function mark(db,data){db.tx(tx=>{tx.run('CREATE TABLE IF NOT EXISTS seed_manifest(digest TEXT NOT NULL) STRICT');if(!tx.get('SELECT 1 FROM seed_manifest'))tx.run('INSERT INTO seed_manifest VALUES (?)',digest(data));});}
module.exports={prepare,mark};
