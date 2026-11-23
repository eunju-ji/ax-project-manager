const {test}=require('node:test');const assert=require('node:assert/strict');const fixture=require('./fixtures/ops-synthetic.json');const M=require('../src/model.js');
const adapt=d=>require('../src/adapter.js').adapt(d);const clone=()=>structuredClone(fixture);const all=v=>v.projects.flatMap(p=>p.tasks.flatMap(t=>t.subtasks));

test('merged tasks, logs, files and reviews never enter the screen projection',()=>{
 const d=clone(),id=d.tasks[0].task_id;d.tasks[0].merged_into=d.tasks[1].task_id;const before=structuredClone(d),v=adapt(d);
 assert.ok(!v.projects.flatMap(p=>p.tasks).some(t=>t.id===id));assert.ok(!all(v).some(w=>d.worklogs.some(raw=>raw.task_id===id&&raw.worklog_id===w.id)));
 assert.ok(!v.projects.flatMap(p=>p.files).some(f=>f.taskId===id));assert.ok(!v.reviews.some(r=>r.taskId===id));assert.deepEqual(d,before);
 d.tasks[0].merged_into=null;assert.ok(adapt(d).projects.flatMap(p=>p.tasks).some(t=>t.id===id));
});
test('reference tasks, records, reviews and reference-only projects are excluded without deleting data',()=>{
 const d=clone();d.tasks[0].plan_source='reference';const before=JSON.stringify(d),v=adapt(d);
 assert.ok(!v.projects.flatMap(p=>p.tasks).some(t=>t.id===d.tasks[0].task_id));
 assert.ok(!all(v).some(w=>d.worklogs.some(raw=>raw.task_id===d.tasks[0].task_id&&raw.worklog_id===w.id)));
 assert.ok(!v.reviews.some(r=>r.taskId===d.tasks[0].task_id));assert.equal(JSON.stringify(d),before);
 d.tasks.forEach(t=>t.plan_source='reference');assert.equal(adapt(d).projects.length,0);
});
test('folders include unlinked files, exclude messages and sanitize URLs, with deterministic name order',()=>{
 const d=clone(),s=d.sources.find(s=>s.source_key==='drive:synthetic:doc');s.folder_id='folder';
 d.sources.push({...s,source_key:'unlinked',title:'A & 합성',uri:'https://drive.google.com/file/d/unlinked',modified_at:'2026-11-18'},
 {...s,source_key:'unsafe',title:'B',uri:'javascript:alert(1)'},{...s,source_key:'message',kind:'message'});
 const v=adapt(d),rows=v.folders.folder;assert.equal(rows.length,3);assert.deepEqual(rows.map(r=>r.name),rows.map(r=>r.name).sort((a,b)=>a.localeCompare(b,'ko')));
 assert.equal(rows.find(r=>r.id==='unlinked').linked,false);assert.equal(rows.find(r=>r.id==='unlinked').modifiedAt,'2026-11-18');assert.equal(rows.find(r=>r.id===s.source_key).linked,true);
 assert.ok(!rows.find(r=>r.id==='unsafe').url);assert.ok(!v.projects.flatMap(p=>p.files).some(f=>f.id==='unlinked'));
});
test('invariant 1: complete Run unique WorkLogs only, duplicate input IDs do not inflate totals',()=>{const d=clone();d.worklogs.push(structuredClone(d.worklogs[0]));const v=adapt(d);assert.deepEqual(all(v).map(s=>s.id).sort(),['WL-1','WL-2','WL-3','WL-4','WL-5','WL-6']);});
test('invariant 2: each sourceId resolves within its project; event links resolve to Source',()=>{const v=adapt(fixture);for(const p of v.projects)for(const t of p.tasks)for(const s of t.subtasks)if(s.sourceId)assert.ok(p.files.some(f=>f.id===s.sourceId));assert.equal(all(v)[0].sourceId,'drive:synthetic:doc');});
test('invariant 3: weekly counts use performed time in Seoul, include dates, exclude unknown',()=>{const v=adapt(fixture),rows=M.weekRecords(v.projects,M.weekRange(v.demoAsOf));assert.equal(rows.length,5);assert.ok(!rows.some(r=>r.subtask.id==='WL-3'));assert.ok(rows.some(r=>r.subtask.id==='WL-4'));});
test('invariant 4: rejected and suggested links never become evidence',()=>{const d=clone();d.links=d.links.filter(l=>l.link_id!=='L-github');const v=adapt(d);assert.ok(!v.projects[0].files.some(f=>/repo|suggested/.test(f.id)));assert.ok(!all(v).find(s=>s.id==='WL-5').sourceId);});
test('invariant 5 / scenario 11: only open task completion reviews enter judgment UI',()=>{const d=clone();d.reviews.push({...d.reviews[0],review_id:'closed',status:'superseded'},{...d.reviews[0],review_id:'invalid',subject_id:'missing'});assert.deepEqual(adapt(d).reviews.map(r=>r.id),['REV-0']);});
test('invariant 6 / scenario 7: unknown performer is empty owner, team work retained without fake dates',()=>{const v=adapt(fixture);assert.equal(all(v).find(s=>s.id==='WL-2').owner,'');assert.equal(all(v).find(s=>s.id==='WL-3').performedAt,'');assert.equal(all(v).find(s=>s.id==='WL-4').performedAt,'2026-11-17');});
test('invariant 7 / scenario 3: representative source uses role, latest time, lexical link ID; task uses latest then ID',()=>{const d=clone();d.links.push({...d.links[0],link_id:'L-a',evidence_type:'source',evidence_key:'github:synthetic:repo',decided_at:'2026-11-18T00:00:00Z'});let v=adapt(d);assert.equal(all(v)[0].sourceId,'github:synthetic:repo');assert.equal(v.projects[0].files.find(f=>f.id==='drive:synthetic:doc').taskId,'TSK-2');const expected=JSON.stringify(v);for(const key of ['projects','tasks','worklogs','links','sources','sourceEvents'])d[key].reverse();assert.equal(JSON.stringify(adapt(d)),expected);d.links.find(l=>l.link_id==='L-a').status='rejected';assert.equal(all(adapt(d))[0].sourceId,'drive:synthetic:doc');});
test('scenarios 1,2,4,5: stored events, recollections and conflicts never invent WorkLogs or mutate input',()=>{const d=clone(),before=JSON.stringify(d);const v=adapt(d);assert.equal(d.sourceEvents.filter(e=>e.kind==='edit').length,3);assert.equal(d.recollections.length,2);assert.equal(d.eventConflicts.length,1);assert.equal(v.projects[0].files.filter(f=>f.id==='drive:synthetic:doc').length,1);assert.equal(v.projects[0].tasks[1].subtasks.length,0);assert.equal(JSON.stringify(d),before);});
test('scenarios 6,8: deleted Source stays, preview disabled; manual WorkLog has no invented evidence',()=>{const v=adapt(fixture);assert.equal(v.projects[0].files.find(f=>f.id==='drive:synthetic:deleted').previewable,false);assert.ok(!('sourceId' in all(v).find(s=>s.id==='WL-5')));});
test('scenarios 9,10: stored conflict does not change task; incomplete, failed, running and missing Runs excluded',()=>{const d=clone();d.worklogs.push({...d.worklogs[0],worklog_id:'missing-run',run_id:'absent'},{...d.worklogs[0],worklog_id:'no-run',run_id:undefined});assert.equal(all(adapt(d)).length,6);assert.equal(adapt(d).projects[0].tasks.length,2);});
test('source deduplication is per project, ties use task_id, representative uses lexical link_id',()=>{const d=clone();d.projects.push({...d.projects[0],project_id:'PRJ-2'});d.tasks.push({...d.tasks[0],task_id:'TSK-3',project_id:'PRJ-2'});d.links.push({...d.links[0],link_id:'L-cross',target_type:'task',target_id:'TSK-3'});d.links.push({...d.links.find(l=>l.link_id==='L-share'),link_id:'L-tie',target_id:'TSK-1'});d.links.push({...d.links[0],link_id:'L-aaa',evidence_type:'source',evidence_key:'github:synthetic:repo'});const v=adapt(d);assert.equal(v.projects[0].files.find(f=>f.id==='drive:synthetic:doc').taskId,'TSK-1');assert.equal(v.projects[1].files.length,1);assert.equal(all(v)[0].sourceId,'github:synthetic:repo');});
test('broken/missing event evidence and incomplete-Run links cannot invent files',()=>{const d=clone();d.links[0].run_id='R-link';d.links.push({...d.links[0],run_id:'R-ok',link_id:'missing',evidence_key:'absent'});assert.ok(!all(adapt(d))[0].sourceId);});
test('adapter passes WBS group paths and defaults absent or null paths to empty arrays',()=>{
 const d=clone();d.tasks[0].wbs_groups=['2 플랫폼','2.1 비교'];d.tasks[1].wbs_groups=null;
 const tasks=adapt(d).projects.flatMap(p=>p.tasks);assert.deepEqual(tasks.find(t=>t.id===d.tasks[0].task_id).wbsGroups,d.tasks[0].wbs_groups);assert.deepEqual(tasks.find(t=>t.id===d.tasks[1].task_id).wbsGroups,[]);
 delete d.tasks[0].wbs_groups;assert.deepEqual(adapt(d).projects.flatMap(p=>p.tasks).find(t=>t.id===d.tasks[0].task_id).wbsGroups,[]);
});
