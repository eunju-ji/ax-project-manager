const {setTimeout:sleep}=require('node:timers/promises');const {FIELDS}=require('./model.cjs');
const DETAIL='create(new),edit,delete(type),rename(newTitle),move(addedParents(driveItem(name)),removedParents(driveItem(name))),comment(post(subtype),assignment(subtype),suggestion(subtype))';
const ACTIVITY_FIELDS=`nextPageToken,activities(primaryActionDetail(${DETAIL}),actors(user(knownUser(personName))),actions(detail(${DETAIL}),actor(user(knownUser(personName))),target(driveItem(name)),timestamp,timeRange),targets(driveItem(name)),timestamp,timeRange)`;
class ApiError extends Error{constructor(status){super(`Drive request failed (${status})`);this.status=status;}}
class DriveClient{
 constructor({driveId,token,base='https://www.googleapis.com/drive/v3/',activityBase='https://driveactivity.googleapis.com/v2/',fetchImpl=fetch,wait=sleep}){
  if(!/^[a-zA-Z0-9_-]+$/.test(driveId||''))throw Error('AX-TF driveId required');
  for(const value of [base,activityBase]){const u=new URL(value);if(u.protocol!=='https:'&&!(u.protocol==='http:'&&u.hostname==='127.0.0.1'))throw Error('unsafe API origin');}
  Object.assign(this,{driveId,token,base,activityBase,fetchImpl,wait});
 }
 async request(resource,params={},body,activity=false){const url=new URL('./'+resource,activity?this.activityBase:this.base);for(const [k,v]of Object.entries(params))if(v!==undefined)url.searchParams.set(k,String(v));
  for(let n=0;n<4;n++){let response;try{response=await this.fetchImpl(url,{method:body?'POST':'GET',headers:{Authorization:`Bearer ${await this.token()}`,...(body?{'Content-Type':'application/json'}:{})},body:body?JSON.stringify(body):undefined,redirect:'error',signal:AbortSignal.timeout(30000)});}catch{throw new ApiError('network');}
   if(response.ok)return response.json();if((response.status===429||response.status>=500)&&n<3){await this.wait(Math.min(30000,Math.max(250*2**n,Number(response.headers.get('retry-after')||0)*1000)));continue;}throw new ApiError(response.status);
  }
 }
 common(){return {driveId:this.driveId,supportsAllDrives:true,includeItemsFromAllDrives:true};}
 start(){return this.request('changes/startPageToken',{driveId:this.driveId,supportsAllDrives:true,fields:'startPageToken'});}
 changes(pageToken){return this.request('changes',{...this.common(),pageToken,fields:`nextPageToken,newStartPageToken,changes(fileId,removed,file(${FIELDS}))`});}
 files(pageToken){return this.request('files',{...this.common(),corpora:'drive',q:'trashed = false',pageToken,pageSize:1000,fields:`nextPageToken,files(${FIELDS})`});}
 file(id){return this.request('files/'+encodeURIComponent(id),{supportsAllDrives:true,fields:FIELDS});}
 activities(since,until,pageToken){return this.request('activity:query',{fields:ACTIVITY_FIELDS},{ancestorName:'items/'+this.driveId,pageSize:100,pageToken,filter:`time >= "${since}" AND time < "${until}"`,consolidationStrategy:{none:{}}},true);}
 check(){/* drives.get needs drive.readonly; the shared drive root folder (id == driveId) is readable with drive.metadata.readonly. */return this.request('files/'+encodeURIComponent(this.driveId),{supportsAllDrives:true,fields:'id,name,driveId,mimeType'}).then(f=>{if(f.driveId!==this.driveId||f.mimeType!=='application/vnd.google-apps.folder')throw Error('Not the shared drive root');return {id:f.id,name:f.name};});}
}
module.exports={DriveClient,ApiError,ACTIVITY_FIELDS};
