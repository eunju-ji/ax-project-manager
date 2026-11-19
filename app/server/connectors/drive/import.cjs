// Offline replay only. This module never uses global fetch or OAuth.
const fs=require('node:fs'),path=require('node:path');
const security=require('./security.cjs'),{DriveClient}=require('./client.cjs'),{DriveCollector}=require('./collect.cjs'),{DriveStore}=require('./store.cjs');
const MAX_BYTES=32*1024*1024;
function readExport(file,driveId){
 security.checkDirs([security.PILOT_DIR]);security.assertPilotPath(file);
 const root=fs.realpathSync(path.join(security.PILOT_DIR,'imports')),resolved=fs.realpathSync(file);
 if(!resolved.startsWith(root+path.sep)||path.extname(resolved)!=='.json'||fs.lstatSync(file).isSymbolicLink())throw Error('import requires imports/*.json');
 const fd=fs.openSync(resolved,'r');let bytes;try{const stat=fs.fstatSync(fd);if(!stat.isFile()||stat.size>MAX_BYTES)throw Error('import size limit');bytes=fs.readFileSync(fd);if(bytes.length>MAX_BYTES)throw Error('import size limit');}finally{fs.closeSync(fd);}
 const data=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes));
 if(data.format!=='ax-drive-export'||data.version!==1||data.driveId!==driveId)throw Error('export format or pinned drive mismatch');
 if(data.error)throw Error('export reported an error; fix it and export again');
 // Resumed fragments and truncated exports are not complete snapshots: importing them would mark existing files missing. Only complete single exports are accepted for now.
 if(data.partial||data.truncated||data.resume)throw Error('partial or truncated export refused; export a shorter period in one run');
 if(!Array.isArray(data.filesPages)||!Array.isArray(data.activityPages)||typeof data.startPageToken!=='string'||!data.startPageToken||!Number.isFinite(Date.parse(data.since))||!Number.isFinite(Date.parse(data.exportedAt))||typeof data.truncated!=='undefined'&&typeof data.truncated!=='boolean')throw Error('invalid export');
 for(const page of data.filesPages)if(!page||page.files!==undefined&&!Array.isArray(page.files))throw Error('invalid files page');
 for(const page of data.activityPages)if(!page||page.activities!==undefined&&!Array.isArray(page.activities))throw Error('invalid activity page');
 return data;
}
function replayFetch(data){
 const files=new Map(data.filesPages.flatMap(p=>p.files||[]).map(f=>[f.id,f]));
 const response=(body,status=200)=>new Response(JSON.stringify(body),{status});
 function page(pages,key,index){const i=index===null||index===undefined?0:Number(index);if(!Number.isInteger(i)||i<0||i>=Math.max(1,pages.length))throw Error('invalid replay page');return response({...pages[i],[key]:pages[i]?.[key]||[],nextPageToken:i+1<pages.length?String(i+1):undefined});}
 return async(url,init)=>{url=new URL(url);const p=url.pathname;
  if(url.origin==='https://www.googleapis.com'){
   if(p==='/drive/v3/files/'+data.driveId)return response({id:data.driveId,name:data.driveName,driveId:data.driveId,mimeType:'application/vnd.google-apps.folder'});
   if(p==='/drive/v3/changes/startPageToken')return response({startPageToken:data.startPageToken});
   if(p==='/drive/v3/changes')return response({changes:[],newStartPageToken:data.startPageToken});
   if(p==='/drive/v3/files')return page(data.filesPages,'files',url.searchParams.get('pageToken'));
   if(p.startsWith('/drive/v3/files/')){const f=files.get(decodeURIComponent(p.slice('/drive/v3/files/'.length)));return response(f||{},f?200:404);}
  }
  if(url.origin==='https://driveactivity.googleapis.com'&&p==='/v2/activity:query')return page(data.activityPages,'activities',JSON.parse(init.body).pageToken);
  throw Error('unrecognized offline replay request');
 };
}
async function importFile(db,driveId,file,{keep=false}={}){
 const data=readExport(file,driveId),store=new DriveStore(db,driveId),runs=[];
 const begin=store.begin.bind(store);store.begin=stream=>{const state=begin(stream);runs.push(state.run_id);return state;};
 const client=new DriveClient({driveId,token:async()=> 'offline',fetchImpl:replayFetch(data)});
 await new DriveCollector(client,store).collect(data.since,{fullSnapshot:true,reconcile:!data.truncated});
 db.tx(tx=>{for(const id of runs){const r=tx.get('SELECT metadata FROM runs WHERE display_key=?',id);tx.run('UPDATE runs SET metadata=? WHERE display_key=?',JSON.stringify({...JSON.parse(r.metadata),import_range:{since:data.since,exportedAt:data.exportedAt,truncated:!!data.truncated,filesPages:data.filesPages.length,activityPages:data.activityPages.length}}),id);}});
 const all=data.filesPages.flatMap(p=>p.files||[]),own=all.filter(f=>f.driveId===driveId),folder='application/vnd.google-apps.folder';
 const summary=db.tx(tx=>({files:own.filter(f=>f.mimeType!==folder).length,folders:own.filter(f=>f.mimeType===folder).length,activities:data.activityPages.reduce((n,p)=>n+(p.activities||[]).length,0),events:tx.get('SELECT count(*) n FROM source_events').n,peopleCandidates:tx.all('SELECT metadata FROM persons').filter(r=>JSON.parse(r.metadata).candidate).length,reviews:tx.get('SELECT count(*) n FROM reviews').n,discardedOtherDrive:all.filter(f=>f.driveId!==driveId).length,truncated:!!data.truncated,...(data.truncated?{warning:'일부 범위만 가져왔습니다. 중단된 내보내기입니다.'}:{})}));
 if(!keep)fs.unlinkSync(file);return summary;
}
module.exports={readExport,replayFetch,importFile,MAX_BYTES};
