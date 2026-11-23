const {normalize}=require('../../domain/normalize.cjs');
const FIELDS='id,driveId,name,mimeType,parents,createdTime,modifiedTime,trashed,lastModifyingUser(displayName,emailAddress,permissionId)';
function metadata(f,driveId){
 if(!f?.id||f.driveId!==driveId)return null;
 const result={};for(const key of ['id','driveId','name','mimeType','parents','createdTime','modifiedTime','trashed'])if(f[key]!==undefined)result[key]=f[key];
 if(f.lastModifyingUser){result.lastModifyingUser={};for(const k of ['displayName','emailAddress','permissionId'])if(f.lastModifyingUser[k])result.lastModifyingUser[k]=f.lastModifyingUser[k];}
 return result;
}
function splitActivity(activity,driveId){
 const actors=(activity.actors||[]).map(a=>a.user?.knownUser?.personName||'unknown');
 const actions=activity.actions?.length?activity.actions:[{detail:activity.primaryActionDetail}];
 const result=[];
 // REST Action: empty target/actor/time inherit the entire activity values.
 for(const action of actions)for(const target of action.target?[action.target]:activity.targets||[]){
  const name=target.driveItem?.name;if(!name?.startsWith('items/'))continue;
  const file_id=name.slice(6),kind=Object.keys(action.detail||{})[0]||'unknown';
  const range=action.timeRange||(!action.timestamp?activity.timeRange:null),at=action.timestamp||(!action.timeRange?activity.timestamp:null);
  result.push(normalize({service:'drive',account_scope:driveId,file_id,source_key:`drive:${driveId}:${file_id}`,action:kind,kind,actor_external_ids:action.actor?[action.actor.user?.knownUser?.personName||'unknown']:actors,...(range?{time_range:[range.startTime,range.endTime],occurred_range:[range.startTime,range.endTime]}:at?{occurred_at:at}:{})}));
 }
 return [...new Map(result.map(e=>[e.event_key,e])).values()];
}
module.exports={FIELDS,metadata,splitActivity};
