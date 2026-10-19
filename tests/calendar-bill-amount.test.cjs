'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
class Element{
 constructor(){this.children=[];this.style={setProperty(){}};this.dataset={};this.classList={add(){},contains(){return false}}}
 appendChild(el){this.children.push(el);return el} append(...els){this.children.push(...els)}
 setAttribute(){} addEventListener(){}
}
function render(obligations){
 const src=fs.readFileSync('public/app.js','utf8');
 const start=src.indexOf('function calendarWeekAgenda('),end=src.indexOf('function renderWorkCalendar(',start);
 const build=vm.runInNewContext(src.slice(start,end)+';calendarWeekAgenda',{
  document:{createElement:()=>new Element()},calendarAgendaMinutes:()=>null,calendarScope:'personal',currentActor:'Рустам',
  calendarSharedTaskOwnerLabel:()=>'',todayState:()=>({key:'2026-10-18'}),CALENDAR_AGENDA_HOUR_HEIGHT:72,
  requestAnimationFrame(){},financeOverviewMoney:value=>new Intl.NumberFormat('ru-RU',{style:'currency',currency:'RUB',maximumFractionDigits:0}).format(value)
 });
 return build('2026-10-19',[],[],[],obligations);
}
function nodes(root){return [root,...root.children.flatMap(nodes)]}
test('weekly bill card displays its amount under the title, including paid and zero amounts',()=>{
 const tree=render([{title:'Chat GPT',amount:1900},{title:'Аренда',amount:45000,paid:true},{title:'Бесплатно',amount:0}]);
 const amounts=nodes(tree).filter(node=>node.className==='calendar-obligation-amount');
 assert.equal(amounts.length,3);
 assert.match(amounts[0].textContent,/1\D900\D*₽/);
 assert.match(amounts[1].textContent,/45\D000\D*₽/);
 assert.match(amounts[2].textContent,/0\D*₽/);
 const first=nodes(tree).find(node=>node.className?.includes('calendar-agenda-payment'));
 assert.equal(first.children[0].textContent,'Chat GPT');
 assert.equal(first.children[1],amounts[0]);
});
