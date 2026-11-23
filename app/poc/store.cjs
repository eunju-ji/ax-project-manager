// Single Node process only. Synchronous row CAS cannot interleave with another request.
// Each row is a separate JSON file; there is deliberately no multi-row transaction.
const fs=require('node:fs');
const path=require('node:path');
const {createHash,randomUUID}=require('node:crypto');
const canonical=v=>Array.isArray(v)?v.map(canonical):v&&typeof v==='object'?Object.fromEntries(Object.keys(v).sort().map(k=>[k,canonical(v[k])])):v;
const digest=v=>createHash('sha256').update(JSON.stringify(canonical(v))).digest('hex');
class Store {
 constructor(dir){this.dir=dir;fs.mkdirSync(dir,{recursive:true});this.inject({});}
 file(table,id){if(!/^[a-zA-Z]+$/.test(table))throw Error('table');return path.join(this.dir,table,digest(id)+'.json');}
 get(table,id){const f=this.file(table,id);return fs.existsSync(f)?JSON.parse(fs.readFileSync(f,'utf8')):null;}
 all(table){const dir=path.dirname(this.file(table,''));return fs.existsSync(dir)?fs.readdirSync(dir).filter(f=>f.endsWith('.json')).map(f=>JSON.parse(fs.readFileSync(path.join(dir,f),'utf8'))):[];}
 inject(options){this.fault=options;this.writes=0;}
 put(table,id,row){const n=++this.writes;if(n===this.fault.failAt)throw Error('injected write failure');const f=this.file(table,id);fs.mkdirSync(path.dirname(f),{recursive:true});const tmp=f+'.tmp';fs.writeFileSync(tmp,JSON.stringify(row));fs.renameSync(tmp,f);if(n===this.fault.loseAt)throw Error('applied but response lost');return row;}
 cas(table,id,version,update){const row=this.get(table,id);if((row?.version||0)!==version)return null;return this.put(table,id,update(row));}
 snapshot(){return Object.fromEntries(['projects','tasks','worklogs','sources','sourceEvents','links','reviews','persons','runs','suppressions','history'].map(t=>[t,this.all(t)]));}
}
module.exports={Store,digest,randomUUID};
