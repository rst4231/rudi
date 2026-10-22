const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const app=fs.readFileSync('public/app.js','utf8');
const helpers=app.slice(app.indexOf('      function parseCycleDate('),app.indexOf('      function renderDianaCycle('));
function calendar(cfg,today='2026-10-22'){
 const context={DAY:86400000,todayState:()=>({utc:Date.parse(today+'T00:00:00Z')})};
 vm.createContext(context);vm.runInContext(helpers,context);
 return {keys:[...context.dianaPeriodDateKeys(cfg)],model:context.dianaCycleModel(cfg)};
}
test('recorded current period marks remaining days through its calculated end',()=>{
 const {keys,model}=calendar({historyStarts:['2026-10-21'],periodLengthDays:6});
 assert.deepEqual(keys,['2026-10-21','2026-10-22','2026-10-23','2026-10-24','2026-10-25','2026-10-26']);
 assert.equal(keys.at(-1),new Date(model.periodEnd).toISOString().slice(0,10));
});
test('an explicit recorded end uses the same range as the cycle model',()=>{
 const {keys,model}=calendar({historyStarts:['2026-10-21'],periodLengthDays:5,lastPeriodEnd:'2026-10-26'});
 assert.equal(keys.at(-1),'2026-10-26');
 assert.equal(keys.at(-1),new Date(model.periodEnd).toISOString().slice(0,10));
 assert.equal(calendar({historyStarts:['2026-10-21'],periodLengthDays:6,lastPeriodEnd:'2026-10-22'}).keys.at(-1),'2026-10-22');
});
test('predicted next cycle and unconfirmed future starts do not create red dots',()=>{
 assert.deepEqual(calendar({historyStarts:[],nextPeriodStart:'2026-10-21',periodLengthDays:6}).keys,[]);
 assert.deepEqual(calendar({historyStarts:['2026-11-21'],periodLengthDays:6}).keys,[]);
});
test('period range crosses a month boundary and retains recorded historical cycles',()=>{
 const {keys}=calendar({historyStarts:['2026-09-01','2026-10-30'],periodLengthDays:5},'2026-10-31');
 assert.deepEqual(keys.slice(-5),['2026-10-30','2026-10-31','2026-11-01','2026-11-02','2026-11-03']);
 assert.equal(keys[0],'2026-09-01');
});
test('old end date does not truncate a newer recorded period',()=>{
 assert.equal(calendar({historyStarts:['2026-09-21','2026-10-21'],lastPeriodEnd:'2026-09-25',periodLengthDays:6}).keys.at(-1),'2026-10-26');
});
test('disabled cycle has no red dots',()=>{
 assert.deepEqual(calendar({enabled:false,historyStarts:['2026-10-21']}).keys,[]);
});
test('period dots reuse the common row, create it on empty dates and respect private scope',()=>{
 class Element{
  constructor(className=''){this.className=className;this.children=[];this.classList={toggle(){}}}
  setAttribute(){}
  appendChild(node){node.remove();this.children.push(node);node.parentElement=this;return node}
  remove(){if(this.parentElement)this.parentElement.children=this.parentElement.children.filter(n=>n!==this);this.parentElement=null}
  querySelector(selector){const name=selector.slice(1);for(const child of this.children){if(child.className===name)return child;const nested=child.querySelector(selector);if(nested)return nested}return null}
 }
 const populated=new Element(),empty=new Element();
 populated.dataset={date:'2026-10-22'};empty.dataset={date:'2026-10-23'};
 const track=populated.appendChild(new Element('calendar-day-indicators'));
 const blue=track.appendChild(new Element('calendar-task-count'));
 const purple=track.appendChild(new Element('rudi-entertainment-marker'));
 // Also relocate a dot left by the previous renderer.
 const red=populated.appendChild(new Element('calendar-period-dot'));
 const ctx={DAY:86400000,calendarScope:'shared',currentActor:'Рустам',
  currentDianaCycleConfig:{historyStarts:['2026-10-21'],periodLengthDays:6},
  todayState:()=>({utc:Date.UTC(2026,9,22)}),
  document:{querySelectorAll:()=>[populated,empty],createElement:()=>new Element()}};
 vm.createContext(ctx);vm.runInContext(helpers,ctx);
 ctx.applyDianaPeriodDots();ctx.applyDianaPeriodDots();
 assert.deepEqual(track.children,[blue,purple,red]);
 assert.equal(empty.querySelector('.calendar-period-dot').parentElement,empty.querySelector('.calendar-day-indicators'));
 assert.equal(empty.querySelector('.calendar-day-indicators').children.length,1);
 ctx.calendarScope='personal';ctx.applyDianaPeriodDots();
 assert.equal(populated.querySelector('.calendar-period-dot'),null);
 assert.equal(empty.querySelector('.calendar-period-dot'),null);
 assert.deepEqual(track.children,[blue,purple]);
 ctx.currentActor='Диана';ctx.applyDianaPeriodDots();
 assert.ok(empty.querySelector('.calendar-period-dot'));
});
