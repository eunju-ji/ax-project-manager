// Inputs are normalized metadata only, never external API responses or private text.
const {digest}=require('./store.cjs');
function normalize(e){
 const utc=v=>v?new Date(v).toISOString():'unknown';
 e={...e};if(e.occurred_at)e.occurred_at=utc(e.occurred_at);if(e.time_range)e.time_range=e.time_range.map(utc);if(e.occurred_range)e.occurred_range=e.occurred_range.map(utc);
 let event_key=e.event_key;
 if(!event_key&&e.service==='github'&&e.sha)event_key=`github:${e.repo_id}:commit:${e.sha}`;
 if(!event_key&&e.service==='drive')event_key=`drive:${e.account_scope}:${e.file_id}:${e.action}:${e.time_range?e.time_range.map(utc).join('~'):utc(e.occurred_at)}:${[...new Set(e.actor_external_ids?.length?e.actor_external_ids:['unknown'])].sort().join(',')}`;
 if(!event_key)throw Error('stable event key required');
 const payload={...e,event_key};delete payload.collected_at;delete payload.normalized_payload_digest;payload.key_version=1;for(const field of ['run_id','created_run_id','version','_changes'])delete payload[field];
 if(payload.actor_external_ids)payload.actor_external_ids=[...new Set(payload.actor_external_ids)].sort();
 return {...e,event_key,key_version:1,normalized_payload_digest:digest(payload)};
}
module.exports={normalize};
