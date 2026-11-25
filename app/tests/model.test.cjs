const {test} = require('node:test');
const assert = require('node:assert/strict');
const M = require('../src/model.js');
test('timeline month respects calendar length, leap years and year rollover',()=>{
 assert.deepEqual(M.monthRange('2026-11-17',0),{start:'2026-11-01',end:'2026-11-30',days:30,label:'2026년 11월'});
 assert.deepEqual(M.monthRange('2024-02-29',0),{start:'2024-02-01',end:'2024-02-29',days:29,label:'2024년 2월'});
 assert.equal(M.monthRange('2026-12-17',1).start,'2027-01-01');
});
test('Korean week is Monday through Sunday, including UTC boundary', () => {
  assert.deepEqual(M.weekRange('2026-11-15T16:00:00Z', 0), {start:'2026-11-16', end:'2026-11-22'});
  assert.deepEqual(M.weekRange('2026-11-17', -1), {start:'2026-11-09', end:'2026-11-15'});
});
test('sort uses task creation, never project update or execution date', () => {
  const rows=[{id:'a',updated:'2099-01-01',tasks:[{createdAt:'2026-11-10'}]}, {id:'b',tasks:[{createdAt:'2026-11-17'}]}, {id:'c',tasks:[]}];
  assert.deepEqual(M.sortProjects(rows).map(p=>p.id), ['b','a','c']);
  assert.equal(rows[0].id,'a');
});
test('weekly records reflect actual executor, category and selected week', () => {
  const rows=[{id:'a',tasks:[{id:'t',topic:'검증',subtasks:[{id:'1',owner:'PM2',performedAt:'2026-11-15T16:00:00Z'},{id:'2',owner:'PM1',performedAt:'2026-11-15T14:59:59Z'}]}]}];
  const records=M.weekRecords(rows,{start:'2026-11-16',end:'2026-11-22'});
  assert.equal(records.length,1);
  assert.equal(records[0].subtask.owner,'PM2');
  assert.equal(records[0].task.topic,'검증');
});
test('source sorting preserves category order and newest first without hiding files', () => {
  const files=Array.from({length:8},(_,i)=>({id:String(i),topic:i<4?'기획·설계':'검증',createdAt:`2026-11-${String(i+1).padStart(2,'0')}`}));
  assert.deepEqual(M.sortedSources(files).map(f=>f.id),['3','2','1','0','7','6','5','4']);
  assert.equal(files[0].id,'0');
});
test('timeline dates come only from recorded work', () => {
  assert.deepEqual(M.projectRange({tasks:[{createdAt:'2026-11-03',subtasks:[{performedAt:'2026-11-17'}]}]}),{start:'2026-11-17',end:'2026-11-17'});
  assert.equal(M.projectRange({tasks:[]}),null);
});
test('creation order respects equivalent ISO timestamps with different offsets',()=>{
 const rows=[{id:'old',tasks:[{createdAt:'2026-11-17T09:00:00+09:00'}]},{id:'new',tasks:[{createdAt:'2026-11-17T01:00:00Z'}]}];
 assert.deepEqual(M.sortProjects(rows).map(p=>p.id),['new','old']);
});
