const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const s=fs.readFileSync(require.resolve('../public/partner-profile.js'),'utf8'),a=s.indexOf(' function selectPartnerPlans('),b=s.indexOf(' function addPlans(',a),ctx={Intl,Date};vm.createContext(ctx);if(a>=0)vm.runInContext(s.slice(a,b),ctx);
test('partner plans use real days off and only future shared unfinished events',()=>{
 const data={work:{configured:true,days:[{date:'2026-10-23',working:true},{date:'2026-10-24',working:false}]},shared:{connected:true,days:[{date:'2026-10-23',events:[{title:'Прошло',startTime:'09:00'},{title:'Личное',startTime:'18:00',assigned:true,assignee:'rst'},{title:'Готово',allDay:true,completed:true},{title:'Вместе',startTime:'17:00',assigned:false},{title:'Скрыто',startTime:'16:00',privateLocal:true}]}]}};
 const out=ctx.selectPartnerPlans('Диана',data,new Date('2026-10-23T12:00:00Z'));assert.equal(out.dayOff,'2026-10-24');assert.equal(out.event.title,'Вместе');assert.equal(out.event.date,'2026-10-23');
});
test('missing schedule is not treated as a day off; Rustam uses the existing weekday routine',()=>{
 const now=new Date('2026-10-23T12:00:00Z');assert.equal(ctx.selectPartnerPlans('Диана',{work:{configured:false},shared:{}},now).dayOff,null);
 assert.equal(ctx.selectPartnerPlans('Рустам',{shared:{}},now).dayOff,'2026-10-24');
});
test('nearest shared event can come from the following month',()=>{
 const out=ctx.selectPartnerPlans('Диана',{shared:{days:[{date:'2026-11-02',events:[{title:'Ноябрь',allDay:true}]},{date:'2026-10-20',events:[{title:'Прошлое',allDay:true}]}]}},new Date('2026-10-31T12:00:00Z'));assert.equal(out.event.title,'Ноябрь');
});

test('tomorrow uses the Moscow calendar across a month boundary',()=>{
 const data={work:{configured:true,days:[{date:'2026-11-01',working:false}]}};
 assert.equal(ctx.selectPartnerPlans('Диана',data,new Date('2026-10-31T20:59:00Z')).dayOffTomorrow,true);
 assert.equal(ctx.selectPartnerPlans('Диана',data,new Date('2026-10-31T21:00:00Z')).dayOffTomorrow,false);
 assert.equal(ctx.selectPartnerPlans('Диана',data,new Date('2026-10-30T12:00:00Z')).dayOffTomorrow,false);
 assert.ok(s.includes("next.dayOffTomorrow?' (завтра)':''"));
});
