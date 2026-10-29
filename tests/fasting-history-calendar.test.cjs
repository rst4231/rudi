const {test}=require('node:test'),assert=require('node:assert/strict');
const core=require('../public/fasting-history.js');
const {JSDOM}=require('jsdom');
const rows=[
 {id:'a',startedAt:'2026-10-28T17:00:00Z',endedAt:'2026-10-28T21:00:00Z',durationMinutes:240,goalHours:14,goalReached:false,earnedStars:0},
 {id:'b',startedAt:'2026-10-28T04:00:00Z',endedAt:'2026-10-28T20:00:00Z',durationMinutes:960,goalHours:16,goalReached:true,earnedStars:1},
 {id:'c',startedAt:'2026-08-31T12:00:00Z',endedAt:'2026-08-31T16:00:00Z',durationMinutes:240,goalHours:12,earnedStars:0}
];
test('aggregate durations use days, approximate months and years instead of hundreds of hours',()=>{
 for(const [minutes,want]of [[0,'0 мин'],[59,'59 мин'],[90,'1 ч 30 мин'],[1440,'1 дн'],[419.8*60,'17 дн 11 ч'],[30*1440,'1 мес'],[32*1440,'1 мес 2 дн'],[365*1440,'1 г'],[NaN,'0 мин'],[Infinity,'0 мин']])assert.equal(core.durationLabel(minutes),want);
});
test('month model groups by completion date in Moscow and keeps multiple sessions',()=>{
 const m=core.monthModel(rows,'2026-10');assert.equal(m.days.length,31);assert.equal(m.offset,3);assert.equal(m.totalMinutes,1200);
 assert.equal(m.days[27].count,1);assert.equal(m.days[28].count,1);assert.equal(m.days[28].date,'2026-10-29');
 const duplicate=core.monthModel([...rows,{...rows[1],id:'d'}],'2026-10');assert.equal(duplicate.days[27].count,2);
 assert.equal(core.monthModel([],'2028-02').days.length,29);
});
test('one visible month navigates locally and a selected day shows only its sessions',()=>{
 const dom=new JSDOM('<body></body>'),view={};try{
 const root=core.render({history:rows,view,today:'2026-10-29'},dom.window.document);dom.window.document.body.append(root);
 assert.equal(root.querySelectorAll('.fasting-calendar-grid').length,1);assert.equal(root.querySelectorAll('.fasting-history-item').length,0);
 assert.match(root.querySelector('.fasting-calendar-title').textContent,/Октябрь 2026/);
 root.querySelector('[data-date="2026-10-28"]').click();assert.equal(root.querySelectorAll('.fasting-history-item').length,1);assert.match(root.querySelector('.fasting-calendar-details').textContent,/16 ч/);
 root.querySelector('[data-month-direction="prev"]').click();assert.match(root.querySelector('.fasting-calendar-title').textContent,/Сентябрь 2026/);assert.equal(root.querySelectorAll('.fasting-history-item').length,0);
 assert.equal(view.month,'2026-09');
 }finally{dom.window.close()}
});
