const crypto=require('node:crypto');
/** @implements {import('../core/contracts.cjs').Storage} */
function createStorage(db,{service,dataset,now=Date.now}={}){
 db.tx(t=>t.run('CREATE TABLE IF NOT EXISTS collection_inbox (cursor INTEGER PRIMARY KEY, person_id TEXT NOT NULL, source_id TEXT NOT NULL, payload TEXT NOT NULL, UNIQUE(person_id,source_id))'));
 const mapTable=(table,key)=>({get:async id=>db.tx(t=>t.get('SELECT * FROM '+table+' WHERE '+key+'=?',id))||null});
 return {
 view:async()=>service.view(),decide:async v=>service.decide(v),
 applyDelta:async(v,options)=>require('../real/apply-delta.cjs').applyDelta(v,{dataset,...options}),
 getUser:async email=>db.tx(t=>t.get('SELECT * FROM users WHERE email=?',email))||null,
 saveUser:async u=>db.tx(t=>t.run('INSERT INTO users(id,email,person_id,role,status,created_at) VALUES (?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET role=excluded.role,status=excluded.status,person_id=excluded.person_id',u.id,u.email,u.person_id||null,u.role,u.status,now())),
 getSession:mapTable('sessions','id').get,
 saveSession:async(id,s)=>db.tx(t=>{t.run('DELETE FROM sessions WHERE id=?',id);if(s)t.run('INSERT INTO sessions VALUES (?,?,?,?,?,?)',id,s.user_id,s.csrf,s.created_at,s.last_seen_at,s.expires_at);}),
 getToken:async hash=>db.tx(t=>t.get('SELECT * FROM ingest_tokens WHERE hash=? AND revoked_at IS NULL',hash))||null,
 saveToken:async(hash,v)=>db.tx(t=>{if(!v)t.run('UPDATE ingest_tokens SET revoked_at=? WHERE hash=?',now(),hash);else t.run('INSERT INTO ingest_tokens VALUES (?,?,?,NULL)',hash,v.label,now());}),
 audit:async(action,actor)=>db.tx(t=>{const id=crypto.randomUUID();t.run('INSERT INTO access_audit(workspace_id,id,display_key,actor_id,action,applied_at) VALUES (?,?,?,?,?,?)','auth',id,id,actor,action,new Date(now()).toISOString());}),
 putInbox:async(person,records)=>db.tx(t=>{for(const r of records)t.run('INSERT INTO collection_inbox(person_id,source_id,payload) VALUES (?,?,?) ON CONFLICT(person_id,source_id) DO NOTHING',person,r.id,JSON.stringify(r));return {ok:true};}),
 getInbox:async since=>db.tx(t=>({records:t.all('SELECT cursor,person_id,payload FROM collection_inbox WHERE cursor>? ORDER BY cursor LIMIT 200',since).map(r=>({...r,payload:JSON.parse(r.payload)})),cursor:String(t.get('SELECT COALESCE(MAX(cursor),0) AS n FROM (SELECT cursor FROM collection_inbox WHERE cursor>? ORDER BY cursor LIMIT 200)',since).n||since)}))
 };
}
module.exports={createStorage};
