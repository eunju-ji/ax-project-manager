const {metadata,splitActivity}=require('./model.cjs');const {uuid7}=require('../../domain/rules.cjs');
class DriveCollector{
 constructor(client,store){this.client=client;this.store=store;this.driveId=client.driveId;this.cache=new Map();}
 async resolve(id,seen=new Set(),fresh=false){
  if(id===this.driveId)return {id,driveId:id,name:'AX-TF',folderPath:'AX-TF'};
  if(seen.has(id))return null;seen.add(id);
  let f=fresh?null:this.cache.get(id);if(!f){try{const raw=await this.client.file(id);f=metadata(raw,this.driveId);if(!f){this.cache.clear();this.unavailable?.set(id,'moved');return null;}}catch(e){if([403,404].includes(e.status)){this.cache.clear();this.unavailable?.set(id,e.status===403?'access_denied':'unknown');return null;}throw e;}if(!f)return null;this.cache.set(id,f);}
  const parent=f.parents?.[0];const p=parent?await this.resolve(parent,seen,fresh):null;
  // A matching driveId is required even if ancestor metadata is inaccessible.
  return {...f,folderPath:p?`${p.folderPath}/${f.name}`:null};
 }
 async save(state,files,events,cursor,done,unavailable=[]){const current=this.store.cursor(state.key);await this.store.page({change_id:uuid7(),connector_id:state.key,run_id:state.run_id,expected_version:current?.version||0,files,unavailable,events,next_cursor:JSON.stringify(cursor),done});}
 async changes({fullSnapshot=false,reconcile=true}={}){const state=this.store.begin('changes');try{
  let cursor=this.store.cursor(state.key);let token=!fullSnapshot&&cursor?JSON.parse(cursor.cursor).token:null;
  for(let reset=0;reset<2;reset++)try{
   if(!token){const start=await this.client.start(),seen=new Set();this.cache.clear();let next;do{const page=await this.client.files(next);for(const raw of page.files||[]){const f=metadata(raw,this.driveId);if(f){seen.add(f.id);this.cache.set(f.id,f);}}const files=[];for(const raw of page.files||[]){if(metadata(raw,this.driveId))files.push(await this.resolve(raw.id));}next=page.nextPageToken;await this.save(state,files.filter(Boolean),[],{token:null},false);}while(next);
    // Reconcile only after every listing page succeeds. A failed files.get is
    // uncertainty, never proof of deletion. Preserve all evidence and judgments.
    const files=[],unavailable=[];
    for(const id of (reconcile?this.store.sourceIds():[]).filter(id=>!seen.has(id))){try{const raw=await this.client.file(id),f=metadata(raw,this.driveId);if(f)files.push({...f,folderPath:null});else unavailable.push({id,availability:raw?.driveId&&raw.driveId!==this.driveId?'moved':'unknown'});}catch(e){unavailable.push({id,availability:e.status===403?'access_denied':'unknown'});}}
    await this.save(state,files,[],{token:null},false,unavailable);token=start.startPageToken;}
   let next;do{const page=await this.client.changes(token);const files=[],unavailable=[];this.cache.clear();for(const change of page.changes||[]){const f=metadata(change.file,this.driveId);if(f){this.cache.set(f.id,f);files.push(await this.resolve(f.id));}else if(change.fileId&&(change.removed||change.file?.driveId)){this.cache.clear();unavailable.push({id:change.fileId,availability:change.file?.driveId&&change.file.driveId!==this.driveId?'moved':'unknown'});}}
    next=page.nextPageToken;token=next||page.newStartPageToken;if(!token)throw Error('missing change token');await this.save(state,files.filter(Boolean),[],{token},!next,unavailable);
   }while(next);return;
  }catch(e){if(reset===0&&[400,410].includes(e.status)){token=null;continue;}throw e;}
 }catch(e){await this.store.fail(state.run_id,e.status);throw e;}}
 async activities(since,{fullSnapshot=false}={}){const state=this.store.begin('activity');try{
  const old=this.store.cursor(state.key);let cursor=!fullSnapshot&&old?JSON.parse(old.cursor):null;
  let from=cursor?.pageToken?cursor.since:cursor?.until||since;let until=cursor?.pageToken?cursor.until:new Date().toISOString();let token=cursor?.pageToken;
  // Revalidate each activity target and ancestors with files.get. Cache is never membership evidence.
  for(let reset=0;reset<2;reset++)try{do{const page=await this.client.activities(from,until,token);this.unavailable=new Map();const events=[],files=new Map();for(const activity of page.activities||[])for(const e of splitActivity(activity,this.driveId)){const f=await this.resolve(e.file_id,new Set(),true);if(!f||f.trashed)continue;files.set(f.id,f);events.push(e);}token=page.nextPageToken;await this.save(state,[...files.values()],events,{since:from,until,pageToken:token||null},!token,[...this.unavailable].map(([id,availability])=>({id,availability})));}while(token);return;}catch(e){if(reset===0&&[400,410].includes(e.status)){token=null;continue;}throw e;}
 }catch(e){await this.store.fail(state.run_id,e.status);throw e;}}
 async collect(since=new Date(Date.now()-14*86400000).toISOString(),options={}){since=new Date(since).toISOString();if(new Date(since)>new Date())throw Error('since must be in the past');await this.changes(options);await this.activities(since,options);}
}
module.exports={DriveCollector};
