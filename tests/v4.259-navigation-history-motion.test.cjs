'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const navigation=fs.readFileSync('public/navigation-history.js','utf8');
const navCss=fs.readFileSync('public/navigation-history.css','utf8');
const ai=fs.readFileSync('public/personal-center.js','utf8');
const aiCss=fs.readFileSync('public/personal-center.css','utf8');
const index=fs.readFileSync('public/index.html','utf8');
const pwa=fs.readFileSync('public/pwa-extras.js','utf8');

function app(initial='home'){
 const handlers={},entries=[{state:null,url:'/'}];let cursor=0;
 const body={dataset:{appTab:initial},classList:{contains:()=>false},appendChild(){}};
 const document={title:'RUDI',documentElement:{dataset:{}},body,
  addEventListener(type,fn){(handlers['doc:'+type]??=[]).push(fn)},
  createElement(){return {style:{},setAttribute(){},textContent:''}}};
 const window={location:{href:'/'},addEventListener(type,fn){(handlers['win:'+type]??=[]).push(fn)}};
 const history={
  get state(){return entries[cursor].state},
  pushState(state,title,url){entries.splice(++cursor);entries[cursor]={state,url:String(url)};window.location.href=String(url)},
  replaceState(state,title,url){entries[cursor]={state,url:String(url)};window.location.href=String(url)},
  back(){if(cursor===0)return;cursor--;window.location.href=entries[cursor].url;
   (handlers['win:popstate']||[]).forEach(fn=>fn({state:history.state}));}
 };
 vm.runInNewContext(navigation,{window,history,document,setTimeout:()=>0},{timeout:1500});
 return {window,history,document,handlers,entries,get cursor(){return cursor}};
}
test('products -> home -> AI -> back goes to home, then products',()=>{
 const s=app();
 s.history.pushState({rudiTab:'products'},'','/?tab=products');
 s.history.pushState({rudiTab:'home'},'','/');
 s.window.RUDI_NAV_PUSH_OVERLAY('personal-ai');
 assert.equal(s.history.state.rudiNavStep,3);
 s.window.RUDI_NAV_BACK({overlayOnly:true});
 assert.equal(s.history.state.rudiTab,'home');
 assert.equal(s.cursor,2);
 s.window.RUDI_NAV_BACK();
 assert.equal(s.history.state.rudiTab,'products');
 assert.equal(s.cursor,1);
});
test('back truncates forward branch; replaceState keeps history depth',()=>{
 const s=app();
 s.history.pushState({rudiTab:'products'},'','/?tab=products');
 s.history.pushState({rudiTab:'home'},'','/');
 s.window.RUDI_NAV_BACK();
 s.history.pushState({rudiTab:'schedule'},'','/?tab=schedule');
 assert.equal(s.entries.length,3);
 assert.equal(s.history.state.rudiNavStep,2);
 s.history.replaceState({rudiTab:'schedule'},'','/?tab=schedule');
 assert.equal(s.history.state.rudiNavStep,2);
});
test('whole-page back buttons use the previous route',()=>{
 const s=app();
 s.history.pushState({rudiTab:'products'},'','/?tab=products');
 s.history.pushState({rudiTab:'finances'},'','/?tab=finances');
 let prevented=false,stopped=false;
 s.handlers['doc:click'][0]({
  target:{closest(selector){assert.match(selector,/financeBackButton/);return {disabled:false}}},
  preventDefault(){prevented=true},stopImmediatePropagation(){stopped=true}
 });
 assert.equal(s.history.state.rudiTab,'products');
 assert.ok(prevented&&stopped);
});
test('fresh deep link falls back to home without leaving the app',()=>{
 const s=app('finances'),events=[];
 s.window.RUDI_NAVIGATE_TO_TAB=(tab,opts)=>events.push({tab,opts});
 assert.equal(s.window.RUDI_NAV_BACK(),true);
 assert.equal(events[0].tab,'home');
 assert.equal(events[0].opts.replace,true);
});
test('history controls transition direction, with reduced motion support',()=>{
 const s=app();s.history.pushState({rudiTab:'products'},'','/?tab=products');
 s.history.back();
 assert.equal(s.document.documentElement.dataset.rudiHistoryDirection,'back');
 assert.match(navCss,/data-rudi-history-direction="back"/);
 assert.match(navCss,/prefers-reduced-motion:reduce/);
});
test('AI centre participates in route history and animates both exit paths',()=>{
 assert.match(ai,/RUDI_NAV_PUSH_OVERLAY\?\.\('personal-ai'\)/);
 assert.match(ai,/RUDI_NAV_BACK\?\.\(\{overlayOnly:true\}\)/);
 assert.match(ai,/window\.addEventListener\('popstate',event=>/);
 assert.match(ai,/hide\(\{fromPopstate:true\}\)/);
 assert.match(ai,/closeSheet\(\{immediate:true\}\)/);
 assert.match(aiCss,/\.rudi-center\.is-leaving/);
 assert.match(aiCss,/\.rudi-center__overlay\.is-closing/);
 assert.match(aiCss,/prefers-reduced-motion:reduce/);
});
test('loading order and auxiliary routes use shared navigation',()=>{
 assert.ok(index.indexOf('/navigation-history.js?v=4.259')<index.indexOf('/app.js?v=4.258'));
 assert.match(index,/\/navigation-history\.css\?v=4\.259/);
 assert.match(pwa,/typeof window\.RUDI_NAVIGATE_TO_TAB==='function'/);
 assert.match(navigation,/#datesBackButton/);
 assert.match(navigation,/#forDiBackButton/);
});
