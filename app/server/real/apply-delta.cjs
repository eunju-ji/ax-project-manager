const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { isDeepStrictEqual: equal } = require('node:util');

const DEFAULT_DATASET = path.join(__dirname, '../.real/real-dataset.json');
const {canonical,merge:mergeCore}=require('../core/delta.cjs');
const digest=v=>crypto.createHash('sha256').update(JSON.stringify(canonical(v))).digest('hex');
const merge=(dataset,state,delta)=>mergeCore(dataset,state,delta,{digest,equal});
// Stage all bytes first, rename dataset last; restore already-replaced files on I/O error.
function replaceFiles(entries) {
 const suffix = `.tmp-${process.pid}-${crypto.randomUUID()}`;
 const staged = [], replaced = [];
 try {
  for (const [file,bytes] of entries) {
   const original=fs.existsSync(file)?fs.readFileSync(file):null;
   const temp=file+suffix;
   staged.push({file,temp,original});fs.writeFileSync(temp,bytes,{flag:'wx',mode:0o600});
  }
  for (const s of staged) { fs.renameSync(s.temp,s.file); replaced.push(s); }
 } catch (error) {
  for (const s of replaced.reverse()) {
   if (s.original===null) fs.unlinkSync(s.file);
   else {fs.writeFileSync(s.temp,s.original,{mode:0o600});fs.renameSync(s.temp,s.file);}
  }
  throw error;
 } finally { for (const s of staged) if(fs.existsSync(s.temp)) fs.unlinkSync(s.temp); }
}
function applyDelta(delta, {dataset=DEFAULT_DATASET,dryRun=false}={}) {
 const dir=path.dirname(path.resolve(dataset));
 const stateFile=path.join(dir,'state.json'), logFile=path.join(dir,'runs.log'), lock=path.join(dir,'apply-delta.lock');
 let owned=false;
 const failure=code=>({ok:false,added:0,updated:0,removed:0,ignored:0,rejected:1,errors:[{code,location:'filesystem'}]});
 try {
  if (fs.existsSync(lock)) {
   if (Date.now()-fs.statSync(lock).mtimeMs<=30*60*1000 || dryRun) return failure('locked');
   fs.unlinkSync(lock);
  }
  if (!dryRun) { const fd=fs.openSync(lock,'wx',0o600);owned=true;try{fs.writeFileSync(fd,JSON.stringify({pid:process.pid}));}finally{fs.closeSync(fd);} }
  const original=JSON.parse(fs.readFileSync(dataset,'utf8'));
  const state=fs.existsSync(stateFile)?JSON.parse(fs.readFileSync(stateFile,'utf8')):{};
  const merged=merge(original,state,delta);
  const {dataset:next,state:nextState,replay,...summary}=merged;
  const audit={...summary,run_id:typeof delta?.run_id==='string'&&/^[A-Za-z0-9_-]{1,64}$/.test(delta.run_id)?delta.run_id:null,processed_at:new Date().toISOString(),dry_run:dryRun};
  if (!dryRun) {
   const log=(fs.existsSync(logFile)?fs.readFileSync(logFile,'utf8'):'')+JSON.stringify(audit)+'\n';
   const entries=[[logFile,log]];
   if (merged.ok && !replay) entries.push([stateFile,JSON.stringify(nextState,null,2)+'\n'],[dataset,JSON.stringify(next,null,2)+'\n']);
   replaceFiles(entries);
  }
  return audit;
 } catch (error) { return failure(error.code==='EEXIST'?'locked':'io_or_invalid_json'); }
 finally { if(owned) fs.unlinkSync(lock); }
}
function main(args) {
 let file, dataset=DEFAULT_DATASET, dryRun=false;
 for(let i=0;i<args.length;i++) {
  if(args[i]==='--dry-run') dryRun=true;
  else if(args[i]==='--dataset' && args[i+1]) dataset=args[++i];
  else if(!file && !args[i].startsWith('--')) file=args[i];
  else throw Error('usage');
 }
 if(!file) throw Error('usage');
 const result=applyDelta(JSON.parse(fs.readFileSync(file,'utf8')),{dataset,dryRun});
 console.log(JSON.stringify(result));if(!result.ok)process.exitCode=1;
}
if(require.main===module) {try{main(process.argv.slice(2));}catch{console.log(JSON.stringify({ok:false,errors:[{code:'invalid_input_or_arguments'}]}));process.exitCode=1;}}
module.exports={applyDelta,merge,DEFAULT_DATASET};
