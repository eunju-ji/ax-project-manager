import {test} from 'node:test';import assert from 'node:assert/strict';
import {createMemoryStorage} from '../src/storage.js';import regressions from '../../server/tests/helpers/correction-review-regressions.cjs';
for(const [name,run] of regressions.cases)test('Workers correction: '+name,async t=>{
 t.mock.timers.enable({apis:['Date'],now:new Date('2026-11-24T15:00:00Z')});const storage=createMemoryStorage({dataset:regressions.fixture()});
 await run(assert,{correct:input=>storage.correct(input,'signed-in'),view:()=>storage.view()});
});
