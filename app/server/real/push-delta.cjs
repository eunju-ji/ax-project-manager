'use strict';
const fs=require('node:fs');
async function pushDelta(file,url,{token=process.env.AX_INGEST_TOKEN,fetch:fetcher=globalThis.fetch}={}) {
 const base=new URL(url);if(base.protocol!=='https:'||base.username||base.password||!token)throw Error('configuration');
 const bytes=fs.readFileSync(file);if(bytes.length>5*1024*1024)throw Error('size');JSON.parse(bytes);
 const r=await fetcher(new URL('/api/ingest/delta',base),{method:'POST',redirect:'error',signal:AbortSignal.timeout(60000),headers:{'Content-Type':'application/json',Authorization:'Bearer '+token},body:bytes});
 if(!r.ok)throw Error('ingest_failed');const {ok,added,updated,removed,ignored,rejected}=await r.json();return {ok,added,updated,removed,ignored,rejected};
}
if(require.main===module){const [file,flag,url]=process.argv.slice(2);if(!file||flag!=='--url'||!url){console.error('usage: push-delta.cjs <delta> --url <PUBLIC_BASE_URL>');process.exitCode=1;}else pushDelta(file,url).then(r=>console.log(JSON.stringify(r))).catch(()=>{console.error('push_failed');process.exitCode=1;});}
module.exports={pushDelta};
