'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const script=fs.readFileSync('public/finance-nav-icons.js','utf8');
const style=fs.readFileSync('public/finance-nav-icons.css','utf8');
const app=fs.readFileSync('public/app.css','utf8');
function setup(storage=new Map()){
 const listeners=new Map(),observers=[],elements={};
 const title=elements.financeLiteracyTitle={textContent:'Первый урок'};
 const bodyText=elements.financeLiteracyBody={textContent:'Тема об инвестициях. '.repeat(44)};
 const panel=elements.financeLiteracyPanel={hidden:true};
 const card={getBoundingClientRect(){return {top:-450,bottom:335}},appendChild(node){elements.rudiLiteracyReadButton=node}};
 const tabs={};
 for(const id of ['personal','crypto','debts','shared','literacy']){
  tabs[id]={dataset:{financeTab:id},setAttribute(k,v){this[k]=v},
  replaceChildren(){this.children=[];this.badge=null},
  append(node){this.children??=[];this.children.push(node);if(node.className==='rudi-literacy-unread')this.badge=node},
  querySelector(q){return q==='.rudi-literacy-unread'?this.badge:null}};
 }
 const body={dataset:{rudiActor:'Рустам',appTab:'finances'},appendChild(node){node.parentElement=body}};
 const nav={dataset:{},parentElement:body,classList:{add(){}},
  querySelectorAll(){return Object.values(tabs)},
  addEventListener(type,fn){listeners.set('nav:'+type,fn)}};
 const document={readyState:'complete',body,hidden:false,
  getElementById(id){return elements[id]||(id==='financeTabs'?nav:null)},
  querySelector(q){
   if(q==='#financeTabs [data-finance-tab="literacy"]')return tabs.literacy;
   if(q==='#financeLiteracyPanel .finance-literacy-card')return card;
   return null;
  },
  createElement(tag){return {tagName:tag,hidden:false,disabled:false,textContent:'',className:'',listeners:{},addEventListener(type,fn){this.listeners[type]=fn},append(){}}},
  addEventListener(type,fn){listeners.set('document:'+type,fn)}};
 const window={innerHeight:700,Telegram:null,addEventListener(type,fn){listeners.set('window:'+type,fn)}};
 const localStorage={getItem(k){return storage.has(k)?storage.get(k):null},setItem(k,v){storage.set(k,v)}};
 class MutationObserver{constructor(fn){this.cb=fn;observers.push(this)}observe(){}}
 vm.runInNewContext(script,{document,window,localStorage,MutationObserver,Intl,Math,setTimeout(){},console});
 return {storage,title,bodyText,panel,card,tabs,body,elements,observers,listeners};
}
test('manual read clears badge, survives reload, does not clear for second partner',()=>{
 const storage=new Map();let ctx=setup(storage);
 assert.equal(ctx.tabs.literacy.badge.hidden,false);
 assert.ok(ctx.elements.rudiLiteracyReadButton);
 ctx.elements.rudiLiteracyReadButton.listeners.click();
 assert.equal(ctx.tabs.literacy.badge.hidden,true);
 assert.equal(ctx.elements.rudiLiteracyReadButton.disabled,true);
 ctx=setup(storage);
 assert.equal(ctx.tabs.literacy.badge.hidden,true,'Reload preserves article read status');
 ctx.body.dataset.rudiActor='Диана';
 ctx.observers[1].cb();
 assert.equal(ctx.tabs.literacy.badge.hidden,false,'Different actor still has unread article');
});
test('new article shows unread badge; reaching article end marks read',()=>{
 const ctx=setup();
 ctx.elements.rudiLiteracyReadButton.listeners.click();
 assert.equal(ctx.tabs.literacy.badge.hidden,true);
 ctx.title.textContent='Второй урок';
 ctx.bodyText.textContent='Новые знания о бюджете и инвестициях. '.repeat(35);
 ctx.observers[0].cb();
 assert.equal(ctx.tabs.literacy.badge.hidden,false,'New content should not inherit old read status');
 ctx.panel.hidden=false;
 ctx.listeners.get('window:scroll')();
 assert.equal(ctx.tabs.literacy.badge.hidden,true,'Reaching article end auto-marks read');
});
test('opening literacy tab does not mark article read',()=>{
 const ctx=setup();
 ctx.listeners.get('nav:click')({target:{closest(){return {}}}});
 assert.equal(ctx.tabs.literacy.badge.hidden,false);
});
test('finance icons match 5-slot home navigation sizes and preserve fixed bottom positioning',()=>{
 assert.match(style,/width:34px!important;height:34px!important/);
 assert.match(style,/width:24px!important;height:24px!important/);
 assert.match(style,/width:32px!important;height:32px!important/);
 assert.match(style,/width:23px!important;height:23px!important/);
 assert.match(style,/min-height:54px!important/);
 assert.match(style,/min-height:52px!important/);
 assert.match(style,/bottom:0!important/);
 assert.match(app,/\.app-tab-icon\{[\s\S]{0,90}width:34px!important/);
});
