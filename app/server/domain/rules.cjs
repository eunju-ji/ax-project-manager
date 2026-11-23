const {randomBytes,createHash}=require('node:crypto');
const canonical=v=>Array.isArray(v)?v.map(canonical):v&&typeof v==='object'?Object.fromEntries(Object.keys(v).sort().map(k=>[k,canonical(v[k])])):v;
const digest=v=>createHash('sha256').update(JSON.stringify(canonical(v))).digest('hex');
let last=0,seq=0;
function uuid7(){let now=Math.max(Date.now(),last);seq=now===last?seq+1:randomBytes(2).readUInt16BE()&4095;if(seq>4095){now++;seq=0;}last=now;const b=randomBytes(16);b.writeUIntBE(now,0,6);b[6]=0x70|(seq>>8);b[7]=seq&255;b[8]=(b[8]&63)|128;const s=b.toString('hex');return `${s.slice(0,8)}-${s.slice(8,12)}-${s.slice(12,16)}-${s.slice(16,20)}-${s.slice(20)}`;}
function canTransition(t,p,actor,to,reason=''){
 const a=t.assignee_id===actor,c=!!actor&&(p.owner_id===actor||p.deputy_id===actor);
 return (t.status==='in_progress'&&to==='completion_proposed'&&a)||(t.status==='completion_proposed'&&to==='completed'&&c)||(t.status==='completion_proposed'&&to==='in_progress'&&(a||(c&&!!reason.trim())))||(t.status==='in_progress'&&to==='completed'&&a&&c)||(t.status==='completed'&&to==='in_progress'&&(a||c)&&!!reason.trim());
}
module.exports={uuid7,digest,canonical,canTransition};
