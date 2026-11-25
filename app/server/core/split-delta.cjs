const {counts}=require('./delta.cjs');
// Stable chunk IDs make retries safe. Checkpoints advance only after the final chunk.
function splitDelta(delta,hash){
 if(counts(delta)<=200)return [delta];
 const fields=['persons','projects','tasks','sources','worklogs','links','person_updates','project_updates','task_updates','worklog_updates','worklog_removals','task_removals','project_removals','person_removals','source_removals','history_purges'];
 if(typeof delta.run_id!=='string'||!/^[A-Za-z0-9_-]{1,64}$/.test(delta.run_id)||Object.keys(delta).some(k=>!['run_id','collected_at','checkpoints','notes','purge',...fields].includes(k))||fields.some(k=>delta[k]!==undefined&&!Array.isArray(delta[k])))throw Error('invalid_delta');
 const prefix=delta.run_id.slice(0,38)+'-'+hash.slice(0,12);const parts=[];let part={},size=0;
 const flush=()=>{parts.push({...part,run_id:prefix+'-'+parts.length,collected_at:delta.collected_at,...(delta.purge!==undefined?{purge:delta.purge}:{})});part={};size=0;};
 for(const field of fields)for(const row of delta[field]||[]){if(size===200)flush();(part[field]||=[]).push(row);size++;}if(size)flush();
 if(delta.checkpoints)parts.at(-1).checkpoints=delta.checkpoints;if(delta.notes)parts.at(-1).notes=delta.notes;return parts;
}
module.exports={splitDelta};
