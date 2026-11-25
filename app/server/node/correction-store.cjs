const fs=require('node:fs');const path=require('node:path');const crypto=require('node:crypto');
const {correct}=require('../core/correction.cjs');
const {makeView}=require('../core/view.cjs');
function normalize(data){return {persons:[],projects:[],tasks:[],worklogs:[],sources:[],links:[],reviews:[],sourceEvents:[],runs:[],...data};}
function read(file){return normalize(require('./human-decisions.cjs').withHumanDecisions(JSON.parse(fs.readFileSync(file,'utf8')),file));}
function view(file){const data=read(file);return {...makeView(data),correctionReady:true,collectedOn:String(data.demoAsOf||''),demoNotice:String(data.demoNotice||'')};}
function save(file,input,actor){
 const lock=path.join(path.dirname(file),'apply-delta.lock'),temp=file+'.'+crypto.randomUUID()+'.tmp';let fd;
 try{
  try{fd=fs.openSync(lock,'wx',0o600);}catch(e){if(e.code==='EEXIST')throw Object.assign(Error('locked'),{status:409});throw e;}
  const r=correct(read(file),input,actor,crypto.randomUUID(),new Date().toISOString());
  fs.writeFileSync(temp,JSON.stringify(r.dataset,null,2)+'\n',{mode:0o600});fs.renameSync(temp,file);return r.result;
 }finally{if(fd!==undefined){fs.closeSync(fd);fs.unlinkSync(lock);}if(fs.existsSync(temp))fs.unlinkSync(temp);}
}
module.exports={view,save,normalize};
