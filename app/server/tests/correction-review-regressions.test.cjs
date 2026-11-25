const {test}=require('node:test'),a=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),os=require('node:os');
const store=require('../node/correction-store.cjs');const {fixture,cases}=require('./helpers/correction-review-regressions.cjs');
for(const [name,run] of cases)test('Node correction: '+name,async t=>{
 t.mock.timers.enable({apis:['Date'],now:new Date('2026-11-24T15:00:00Z')});
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'ax-review-regression-')),file=path.join(dir,'dataset.json');t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));fs.writeFileSync(file,JSON.stringify(fixture()));
 await run(a,{correct:async input=>store.save(file,input,'signed-in'),view:async()=>store.view(file)});
});
