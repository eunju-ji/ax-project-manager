const {test}=require('node:test');const a=require('node:assert/strict');const M=require('../src/model.js');
const today='2026-11-25',log=d=>({performedAt:d,owner:'A'});
test('schedule closes completed open plan and exposes deadline/activity/invalid shapes',()=>{
 a.equal(M.taskSchedule({startDate:'2026-11-01',status:'completed',completedAt:'2026-11-10'},today).end,'2026-11-10');
 a.equal(M.taskSchedule({startDate:'2026-11-01',status:'completed',subtasks:[log('2026-11-09')]},today).end,'2026-11-09');
 a.equal(M.taskSchedule({dueDate:'2026-11-10'},today).deadline,true);
 a.equal(M.taskSchedule({subtasks:[log('2026-11-10')]},today).activity,true);
 a.equal(M.taskSchedule({startDate:'2026-11-11',dueDate:'2026-11-10'},today).invalid,true);
 a.equal(M.plannedRange({tasks:[{createdAt:today,subtasks:[]}]},today),null);
 a.equal(M.progress({tasks:[{status:'completed'},{merged_into:'x'}]},today).percent,100);
});
test('period target requires work by selected person within selected dates',()=>{
 const p={tasks:[{id:'plan',owner:'A',startDate:'2026-11-01',dueDate:today,subtasks:[]},{id:'work',owner:'B',subtasks:[log('2026-11-10')] }]};
 a.equal(M.periodTasks([p],{start:'2026-11-10',end:'2026-11-10'},'A').length,1);
 a.equal(M.periodTasks([p],{start:'2026-11-10',end:'2026-11-10'},'B').length,0);
});
test('summary joins work per task with subject and no colon or remainder shorthand',()=>{
 const rows=['서버 분리','Workers 연결부 추가','테스트 작성','화면 정리'].map(title=>({task:{id:'t'},subtask:{owner:'Eunju Ji',title}}));
 a.match(M.workSummary(rows),/Eunju Ji가 .*등 4건의 작업을 했습니다\./);a.doesNotMatch(M.workSummary(rows),/:|외 \d+건/);
 a.doesNotMatch(M.workSummary(rows,'Eunju Ji'),/Eunju Ji/);
});
