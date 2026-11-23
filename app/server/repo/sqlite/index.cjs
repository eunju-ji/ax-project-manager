const {DatabaseSync,backup}=require('node:sqlite');
const fs=require('node:fs');const path=require('node:path');
function open(file,{busyTimeout=50}={}){
 const life=require('./lifecycle.cjs');const release=life.gate(file,()=>life.acquire(file));
 const db=new DatabaseSync(file);db.exec(`PRAGMA foreign_keys=ON; PRAGMA journal_mode=WAL; PRAGMA synchronous=NORMAL; PRAGMA busy_timeout=${Number(busyTimeout)|0};`);
 if(db.prepare('PRAGMA foreign_keys').get().foreign_keys!==1)throw Error('foreign keys disabled');
 db.exec('CREATE TABLE IF NOT EXISTS schema_migrations(version TEXT PRIMARY KEY NOT NULL, applied_at TEXT NOT NULL) STRICT');
 for(const name of fs.readdirSync(path.join(__dirname,'../../db/migrations')).sort()){
  if(!db.prepare('SELECT 1 FROM schema_migrations WHERE version=?').get(name)){
   db.exec('BEGIN IMMEDIATE');try{db.exec(fs.readFileSync(path.join(__dirname,'../../db/migrations',name),'utf8'));db.prepare('INSERT INTO schema_migrations VALUES (?,?)').run(name,new Date().toISOString());db.exec('COMMIT');}catch(e){db.exec('ROLLBACK');throw e;}
  }
 }
 let active=false;
 return {file,tx(fn){if(active)throw Error('nested transaction');db.exec('BEGIN IMMEDIATE');active=true;let valid=true;
  const check=()=>{if(!valid)throw Error('expired transaction');};
  const tx={run(sql,...p){check();return db.prepare(sql).run(...p);},get(sql,...p){check();return db.prepare(sql).get(...p);},all(sql,...p){check();return db.prepare(sql).all(...p);}};
  try{const result=fn(tx);if(result?.then)throw Error('async transaction forbidden');db.exec('COMMIT');return result;}catch(e){db.exec('ROLLBACK');throw e;}finally{valid=false;active=false;}
 },async backup(destination){if(active)throw Error('active transaction');return backup(db,destination);},close(){db.close();release();}};
}
module.exports={open};
