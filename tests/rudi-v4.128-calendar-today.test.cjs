'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const app=fs.readFileSync('public/app.js','utf8');
const callback=app.match(/document\.getElementById\('calendarToday'\)\?\.addEventListener\('click',\(\)=>\{([\s\S]*?)\n        \}\);/);
test('Today button returns from another date in the current month and invalidates cached render',()=>{
  assert.ok(callback,'Calendar Today click handler should exist');
  for(const selectedDate of ['2026-10-17','2026-09-17']){
    const state={
      calendarDateCursor:'2026-10-09',
      currentSelectedWorkDate:selectedDate,
      currentWorkCalendarRenderSignature:'render-for-today',
      todayState:()=>({key:'2026-10-09'}),
      calendarSaveView(){state.saved=state.currentSelectedWorkDate},
      loadWorkCalendar(mode,opts){
        state.reloaded=mode==='month'&&opts.silent===true;
        state.renderCanRun=state.currentWorkCalendarRenderSignature==='';
        return Promise.resolve();
      }
    };
    vm.runInNewContext(callback[1],state);
    assert.equal(state.currentSelectedWorkDate,'2026-10-09');
    assert.equal(state.calendarDateCursor,'2026-10-09');
    assert.equal(state.saved,'2026-10-09');
    assert.equal(state.reloaded,true);
    assert.equal(state.renderCanRun,true,'signature must be invalidated before cached render');
  }
  assert.match(app,/if\(cached\)renderWorkCalendar\(cached\)/);
});
