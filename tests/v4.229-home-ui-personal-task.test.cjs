'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const home=fs.readFileSync('public/home-reference-layout.js','utf8');
const task=fs.readFileSync('public/personal-task-editor.js','utf8');
const css=fs.readFileSync('public/home-reference-layout.css','utf8');
const html=fs.readFileSync('public/index.html','utf8');
function tile(id,initialHidden=false){
 const m=new Map([['display',{value:'flex',priority:'important'}]]);
 return {id,hidden:initialHidden,dataset:{},
 style:{getPropertyValue:p=>m.get(p)?.value||'',getPropertyPriority:p=>m.get(p)?.priority||'',
  setProperty:(p,value,priority='')=>m.set(p,{value,priority}),removeProperty:p=>m.delete(p)}};
}
function route(initial){
 const p=tile('homeRustamTile'),rail=tile('rudiHomeShortcuts',true),nodes=[p,rail],events={};
 const body={dataset:{appTab:initial}};
 const doc={body,readyState:'loading',fonts:null,getElementById:()=>null,querySelector:()=>null,
  querySelectorAll:s=>s==='[data-app-tab-section="home"]'?nodes:[],
  addEventListener:(name,cb)=>events['doc:'+name]=cb};
 const win={addEventListener:(name,cb)=>events['win:'+name]=cb};
 vm.runInNewContext(home,{document:doc,window:win,requestAnimationFrame:cb=>{cb();return 1},cancelAnimationFrame(){}},{timeout:1200});
 events['doc:DOMContentLoaded']();
 const navigate=t=>{body.dataset.appTab=t;events['win:rudi:app-tab-change']();};
 return {p,rail,navigate};
}
test('six shortcuts are restored when returning from Finance or Calendar',()=>{
 for(const t of ['finances','schedule']){
  const r=route('home');r.navigate(t);
  assert.equal(r.rail.hidden,true);
  assert.equal(r.rail.style.getPropertyValue('display'),'none');
  r.navigate('home');
  assert.equal(r.rail.hidden,false);
  assert.notEqual(r.rail.style.getPropertyValue('display'),'none');
  assert.equal(r.p.hidden,false);
 }
});
test('first boot from Finance to Home restores a rail hidden before the guard',()=>{
 const r=route('finances');r.navigate('home');
 assert.equal(r.rail.hidden,false);
 assert.notEqual(r.rail.style.getPropertyValue('display'),'none');
});
test('rebinding reused task card updates data without duplicating listeners',()=>{
 const section=task.slice(task.indexOf('function bind(element,task,ctx)'),task.indexOf('window.RUDIPersonalTaskEditor='));
 assert.ok(section.startsWith('function bind('));
 const opened=[];
 const bind=vm.runInNewContext(section+';bind',{showMenu:(item,ctx)=>opened.push({task:item.id,ctx:ctx.token}),window:{},setTimeout,clearTimeout},{timeout:1200});
 const handlers={};const element={dataset:{},classList:{add(){},remove(){}},
  addEventListener:(name,fn)=>{(handlers[name]??=[]).push(fn);}};
 bind(element,{id:'first',personal:true,date:'2026-10-14',startTime:'09:00'},{token:'one'});
 bind(element,{id:'second',personal:true,date:'2026-10-22',startTime:'15:45'},{token:'two'});
 assert.equal(handlers.contextmenu.length,1);
 handlers.contextmenu[0]({pointerType:'mouse',preventDefault(){},stopPropagation(){}});
 assert.deepEqual(opened,[{task:'second',ctx:'two'}]);
});
test('each task provides independent date and time to the native editor',()=>{
 const source=task.slice(task.indexOf('function normalizedEditorWhen(task)'),task.indexOf('function open(task,ctx='));
 const normalize=vm.runInNewContext(source+';normalizedEditorWhen',{},{timeout:1200});
 assert.equal(normalize({date:'2026-10-14',startTime:'08:15'}).time,'08:15');
 assert.deepEqual(JSON.parse(JSON.stringify(normalize({date:'2026-10-20',startTime:'17:30'}))),{date:'2026-10-20',time:'17:30'});
 assert.match(task,/f\('date'\)\.value='';[\s\S]{0,100}f\('time'\)\.value='';/);
 assert.match(task,/f\('date'\)\.defaultValue=date;/);
});
test('home spacing and cache version stay scoped to this release',()=>{
 assert.match(css,/home-dashboard-summary\{[\s\S]{0,75}padding-block:8px!important/);
 assert.match(css,/profile-person-details:has\(\.profile-supplement-intakes\)/);
 assert.match(css,/profile-supplement-intakes\{[\s\S]{0,60}margin-top:0!important/);
 assert.match(html,/home-reference-layout\.js\?v=4\.\d+/);
 assert.match(html,/personal-task-editor\.js\?v=4\.229/);
});
