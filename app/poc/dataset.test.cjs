const {test}=require('node:test'),a=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {generate,serialize}=require('./dataset/generate.cjs'),{validateReferences}=require('./dataset/references.cjs'),{adapt}=require('../src/adapter.js'),M=require('../src/model.js'),base=require('../data.json');
const d=generate(),v=adapt(d),logs=v.projects.flatMap(p=>p.tasks.flatMap(t=>t.subtasks)),names=['김지현','박성진','이수민'];
const some=(table,p)=>a.ok(d[table].some(p),table);
test('v2 quantities, three members and deterministic bytes',()=>{a.equal(d.projects.length,7);a.deepEqual(d.persons.map(p=>p.display_name),names);a.equal(d.externalAccounts.length,8);for(const [k,n] of Object.entries({tasks:50,worklogs:200,sources:200,sourceEvents:450,links:350,reviews:25,runs:45}))a.ok(d[k].length>=n*.85&&d[k].length<=n*1.15,k);a.equal(serialize(d),serialize(generate()));a.equal(serialize(d),fs.readFileSync(path.join(__dirname,'dataset/synthetic-large.json'),'utf8'));});
test('v2 preserves baseline projects tasks records files and their presentation',()=>{for(const p of base.projects){const ap=v.projects.find(x=>x.id===p.id);a.ok(ap);for(const key of ['name','desc','owner'])a.equal(ap[key],p[key]);for(const t of p.tasks){const at=ap.tasks.find(x=>x.id===t.id);a.ok(at);for(const key of ['title','topic','summary','detail','decision','weeklySummary','owner','createdAt'])a.equal(at[key],t[key]);for(const w of t.subtasks){const aw=at.subtasks.find(x=>x.id===w.id);a.ok(aw);for(const key of ['title','summary','owner','performedAt','sourceId','artifact'])a.equal(aw[key],w[key]);}}for(const f of p.files)a.equal(ap.files.find(x=>x.id===f.id)?.name,f.name);}for(const p of v.projects)for(const t of p.tasks)for(const n of [t.owner,...t.subtasks.map(w=>w.owner)])a.ok(!n||names.includes(n));for(const table of ['projects','tasks','worklogs','sources'])for(const r of d[table])for(const k of ['name','title','summary'])if(r[k]){a.doesNotMatch(r[k],/가상|합성|샘플/);if(!Object.values(require('./dataset/work-catalogue.json')).filter(Array.isArray).flat().some(x=>x[0]===r[k]||x[1]===r[k]))a.doesNotMatch(r[k],/테스트/);}});
test('v2 execution evidence and date boundary cases',()=>{some('worklogs',w=>w.performer_id==='unknown');for(const precision of ['date','unknown'])some('worklogs',w=>w.performed_at_precision===precision);some('worklogs',w=>w.origin==='manual'&&!d.links.some(l=>l.target_type==='worklog'&&l.target_id===w.worklog_id));some('worklogs',w=>new Set(d.links.filter(l=>l.target_id===w.worklog_id).map(l=>l.evidence_key)).size>=2);some('sources',s=>new Set(d.links.filter(l=>l.evidence_key===s.source_key).map(l=>l.target_id)).size>=2);const pair=d.worklogs.filter(w=>w.collaboration_id==='COL-1');a.equal(pair.length,2);a.equal(new Set(pair.map(w=>w.performer_id)).size,2);a.equal(pair[0].task_id,pair[1].task_id);a.ok(pair.every(w=>w.performed_at));a.equal(M.weekRecords(v.projects,{start:'2026-08-17',end:'2026-08-23'}).length,0);a.ok(d.worklogs.filter(w=>w.performed_at).every(w=>M.day(w.performed_at)>='2026-08-03'&&M.day(w.performed_at)<='2026-11-17'));a.ok(d.worklogs.filter(w=>w.performed_at&&d.tasks.find(t=>t.task_id===w.task_id).project_id==='ax').every(w=>M.day(w.performed_at)>='2026-09-21'));some('worklogs',w=>w.performed_at&&[0,6].includes(new Date(w.performed_at).getUTCDay()));some('worklogs',w=>w.performed_at&&kst(w.performed_at).getUTCHours()>=22);some('worklogs',w=>w.clock_fixture==='utc_before');some('worklogs',w=>w.clock_fixture==='utc_after');});
test('v2 external actors event scenarios and lifecycle boundaries',()=>{a.equal(new Set(d.sources.filter(s=>s.repo_id).map(s=>s.repo_id)).size,2);for(const state of ['access_denied','moved','deleted','unknown']){const n=d.sources.filter(s=>s.availability===state).length;a.ok(n>=1&&n<=3);}for(const kind of ['edit','comment','rename','move','permission_change','commit','pr_open','pr_merged','pr_closed','review'])some('sourceEvents',e=>e.kind===kind);some('sourceEvents',e=>e.author_external_id&&e.author_external_id!==e.committer_external_id);some('sourceEvents',e=>e.author_external_id==='bot-dependencies');some('sourceEvents',e=>e.actor_external_ids.includes('unmapped-account'));for(const fixture of ['valid','missing','cross_project','suppressed','injection'])some('sourceEvents',e=>e.fixture===fixture);for(const state of ['confirmed','suggested','rejected'])some('links',l=>l.status===state);for(const scope of ['source','event'])some('suppressions',s=>s.scope===scope);some('suppressions',s=>s.released_at);for(const kind of ['completion','link','new_task','conflict','performer'])some('reviews',r=>r.kind===kind);for(const state of ['open','decided','superseded'])some('reviews',r=>r.status===state);for(const state of ['in_progress','completion_proposed','completed'])some('tasks',t=>t.status===state);some('tasks',t=>t.self_approved&&t.assignee_id===d.projects.find(p=>p.project_id===t.project_id).owner_id);some('tasks',t=>t.confirmed_by===d.projects.find(p=>p.project_id===t.project_id).deputy_id);some('history',h=>h.before?.status==='completed'&&h.after?.status==='in_progress');const n=d.runs.filter(r=>r.state==='incomplete').length;a.ok(n>=1&&n<=2);a.equal(d.runs.filter(r=>r.state==='failed').length,1);some('runs',r=>r.error==='permission denied');a.equal(d.collectionInputs[0].event_key,d.collectionInputs[1].event_key);a.equal(d.collectionInputs[0].normalized_payload_digest,d.collectionInputs[1].normalized_payload_digest);a.notEqual(d.collectionInputs[0].normalized_payload_digest,d.collectionInputs[2].normalized_payload_digest);});
test('B8 v2 roles accounts all supplied Run and History manifest references',()=>{a.deepEqual(validateReferences(d),[]);for(const mutate of [x=>x.projects[0].owner_id='missing',x=>x.externalAccounts[0].person_id='missing',x=>x.links[0].run_id='missing',x=>x.history[0].entity_id='missing',x=>x.runs.find(r=>r.manifest.length).manifest[0].payload.task_id='missing',x=>x.history[0].basis=['missing']]){const bad=structuredClone(d);mutate(bad);a.ok(validateReferences(bad).length>0);}for(const url of serialize(d).match(/https?:[^"\s]+/g)||[])a.ok(url.startsWith('https://example.invalid/'));});
test('v2 seven adapter invariants and creation Run isolation',()=>{const complete=new Set(d.runs.filter(r=>r.state==='complete').map(r=>r.run_id));a.equal(logs.length,d.worklogs.filter(w=>complete.has(w.run_id)&&complete.has(w.created_run_id)).length);a.equal(new Set(logs.map(w=>w.id)).size,logs.length);for(const p of v.projects)for(const t of p.tasks)for(const w of t.subtasks)if(w.sourceId)a.ok(p.files.some(f=>f.id===w.sourceId));const weekly=M.weekRecords(v.projects,{start:'2026-08-03',end:'2026-11-17'});a.equal(weekly.length,logs.filter(w=>w.performedAtPrecision!=='unknown').length);a.deepEqual(v,adapt({...d,links:d.links.filter(l=>l.status!=='rejected')}));a.ok(v.reviews.every(r=>r.kind==='completion'));a.ok(logs.some(w=>w.owner===''));a.deepEqual(v,adapt(structuredClone(d)));const changed=structuredClone(d),hidden=changed.worklogs.find(w=>!complete.has(w.created_run_id));hidden.run_id='RUN-1';a.equal(adapt(changed).projects.flatMap(p=>p.tasks.flatMap(t=>t.subtasks)).length,logs.length);});
test('v2 persisted pending WorkLog isolation canonical duplicate and recovery',t=>{const os=require('node:os'),{createServer}=require('./server.cjs'),{Matcher}=require('./matching.cjs');const dir=fs.mkdtempSync(path.join(os.tmpdir(),'ax-v2-'));t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));const {s,w}=createServer({dir}),pending=d.worklogs.find(w=>d.runs.find(r=>r.run_id===w.run_id)?.state==='incomplete'),id=pending.run_id;a.equal(new Matcher(s,w).updateSummary(pending.worklog_id,'new').rejected,true);a.equal(adapt(s.snapshot()).projects.flatMap(p=>p.tasks.flatMap(t=>t.subtasks)).length,logs.length);const matcher=new Matcher(s,w),e=d.sourceEvents[0],before=s.all('links').length;a.equal(matcher.collect([e])[0].status,'duplicate');a.equal(matcher.match({...e,text:'changed TSK-MISSING'}).collection,'conflict');a.equal(s.all('links').length,before);a.equal(w.resume(id).state,'complete');a.equal(s.get('worklogs',pending.worklog_id).version,1);a.equal(adapt(s.snapshot()).projects.flatMap(p=>p.tasks.flatMap(t=>t.subtasks)).length,logs.length+1);});
test('v2 bot evidence preserves unknown performer without a fourth person',()=>{const bot=d.sourceEvents.find(e=>e.author_external_id==='bot-dependencies'),link=d.links.find(l=>l.evidence_type==='event'&&l.evidence_key===bot.event_key&&l.target_type==='worklog');a.ok(link);a.equal(d.worklogs.find(w=>w.worklog_id===link.target_id).performer_id,'unknown');a.equal(d.persons.length,3);});
const catalogue=require('./dataset/work-catalogue.json');
const kst=at=>new Date(Date.parse(at)+9*3600000);
test('catalogue wording and actors appear without template titles',()=>{
 for(const w of d.worklogs)a.ok(!w.title.includes(' · '),w.title);
 for(const [id,rows] of Object.entries(catalogue))if(Array.isArray(rows))for(const [title,summary,kind,actor] of rows){
  const w=d.worklogs.find(w=>w.task_id===id&&w.title===title&&w.summary===summary);a.ok(w,title);
  if(actor)a.equal(w.performer_id,actor,title);
 }
 a.equal(d.worklogs.length,191);a.ok(Buffer.byteLength(serialize(d))<=2*1024*1024);
});
test('at least 95 percent of exact work clocks are weekdays 09 to 19 KST',()=>{
 const exact=d.worklogs.filter(w=>w.performed_at_precision==='exact'),office=exact.filter(w=>{const x=kst(w.performed_at);return ![0,6].includes(x.getUTCDay())&&x.getUTCHours()>=9&&x.getUTCHours()<19;});
 a.ok(office.length/exact.length>=.95,office.length+'/'+exact.length);
 // Baseline has 23 records at 10:00 and 23 at 12:00; protect it verbatim.
 const added=exact.filter(w=>w.worklog_id.startsWith('WL-')),counts={};
 for(const w of added){const minute=kst(w.performed_at).toISOString().slice(11,16);counts[minute]=(counts[minute]||0)+1;}
 a.ok(Math.max(...Object.values(counts))/added.length<=.10);
});
test('catalogue evidence uses the named source and matching service',()=>{
 for(const [id,rows] of Object.entries(catalogue))if(Array.isArray(rows))for(const [title,,kind] of rows){
  const w=d.worklogs.find(w=>w.task_id===id&&w.title===title);a.ok(w,title);
  const links=d.links.filter(l=>l.target_type==='worklog'&&l.target_id===w.worklog_id);
  if(kind==='none'){a.equal(w.origin,'manual');a.equal(links.length,0);continue;}
  a.ok(links.some(l=>{const event=l.evidence_type==='event'&&d.sourceEvents.find(e=>e.event_key===l.evidence_key),s=d.sources.find(s=>s.source_key===(event?event.source_key:l.evidence_key));return s?.title===title&&(kind==='commit'||kind==='pr'?!!s.repo_id:!s.repo_id);}),title);
 }
});

test('catalogue deterministic serialization and original 47 texts and clocks',()=>{
 a.equal(serialize(d),serialize(generate()));
 a.equal(serialize(d),fs.readFileSync(path.join(__dirname,'dataset/synthetic-large.json'),'utf8'));
 const original=base.projects.flatMap(p=>p.tasks.flatMap(t=>t.subtasks));a.equal(original.length,47);
 for(const w of original){const actual=d.worklogs.find(x=>x.worklog_id===w.id);a.equal(actual.title,w.title);a.equal(actual.summary,w.summary);a.equal(actual.performed_at,w.performedAt);}
});
test('catalogue order and preparation before original work',()=>{
 for(const [id,rows] of Object.entries(catalogue))if(Array.isArray(rows)){
  const task=d.tasks.find(t=>t.task_id===id),original=base.projects.flatMap(p=>p.tasks).find(t=>t.id===id);
  const work=rows.map(([title])=>d.worklogs.find(w=>w.task_id===id&&w.title===title));
  const dates=work.map(w=>(w.performed_at||w.known_date).slice(0,10));
  for(let i=0;i<dates.length;i++){
   a.ok(dates[i]>=(task.project_id==='ax'?'2026-09-21':'2026-08-03')&&dates[i]<=d.demoAsOf);
   if(i)a.ok(dates[i]>=dates[i-1],id);
  }
  if(original)a.ok(Date.parse(work.at(-1).performed_at||work.at(-1).known_date)<Date.parse(original.subtasks[0].performedAt),id);
 }
});
test('changed dataset hash backs up runtime and same seed preserves judgments',t=>{
 const os=require('node:os'),{createServer}=require('./server.cjs'),{digest}=require('./store.cjs');
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'ax-catalogue-')),dir=path.join(root,'runtime');
 t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
 const first=createServer({dir});first.s.put('metadata','seed',{...first.s.get('metadata','seed'),hash:'previous-dataset'});
 first.s.put('tasks','AX-01',{...first.s.get('tasks','AX-01'),version:91});
 const second=createServer({dir}),backup=fs.readdirSync(root).find(n=>n.startsWith('runtime.backup-'));
 a.ok(backup);a.equal(second.s.get('tasks','AX-01').version,1);
 a.equal(second.s.get('metadata','seed').hash,digest(serialize(d)));
 const {Store}=require('./store.cjs');a.equal(new Store(path.join(root,backup)).get('tasks','AX-01').version,91);
 second.s.put('tasks','AX-01',{...second.s.get('tasks','AX-01'),version:17});
 a.equal(createServer({dir}).s.get('tasks','AX-01').version,17);
});
