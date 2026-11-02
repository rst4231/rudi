const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const js=fs.readFileSync('public/app.js','utf8');
function project(items,scope='personal'){
 const a=js.indexOf('let calendarSupplementState=');const b=js.indexOf('function calendarRepaintSupplements(',a);
 return vm.runInNewContext(js.slice(a,b)+'\ncalendarSupplementState={actor:"Рустам",items:inputItems,loadedAt:1}; calendarSupplementDayEntries',{
  inputItems:items,calendarScope:scope,currentActor:'Рустам',todayState:()=>({key:'2026-11-02'}),
  calendarDateShift:(date,days)=>new Date(Date.parse(date+'T00:00:00Z')+days*86400000).toISOString().slice(0,10)
 });
}
test('skipped supplement stays skipped across all scheduled slots and historical course changes',()=>{
 const item={id:'mg',name:'Магний',status:'finished',course:{startDate:'2026-11-02'},schedule:{timesPerDay:2,times:['09:00','21:00']},intakes:[],skips:[{date:'2026-10-30'}]};
 const entries=project([item])('2026-10-30');assert.equal(entries.length,2);
 for(const entry of entries){assert.equal(entry.skipped,true);assert.equal(entry.completed,false);assert.equal(entry.canComplete,false)}
 assert.equal(item.intakes.length,0);
});
test('unskipped and taken records remain distinct and personal only',()=>{
 const item={id:'mg',name:'Магний',status:'active',course:{},schedule:{timesPerDay:1,times:['21:00']},intakes:[{date:'2026-11-01',slot:0}],skips:[{date:'2026-10-30'}]};const get=project([item]);
 assert.equal(get('2026-11-01')[0].completed,true);assert.equal(get('2026-11-01')[0].skipped,false);
 assert.equal(get('2026-11-02')[0].completed,false);assert.equal(get('2026-11-02')[0].skipped,false);assert.equal(project([item],'shared')('2026-10-30').length,0);
});
test('skipped calendar entries do not contribute to overdue tasks',()=>{
 const a=js.indexOf('function calendarOverdueTaskCount('),b=js.indexOf('function appendCalendarOverdueMarker(',a);
 const count=vm.runInNewContext(js.slice(a,b)+'\ncalendarOverdueTaskCount');
 assert.equal(count('2026-10-30',[{skipped:true,completed:false},{completed:false}], '2026-11-02'),1);
});
