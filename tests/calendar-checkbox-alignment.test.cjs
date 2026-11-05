'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),{JSDOM}=require('jsdom');
const source=fs.readFileSync('public/app.js','utf8'),start=source.indexOf('const attachCompletion=(row,task)=>{'),end=source.indexOf('// Weekly timeline shows',start);
function checkbox(mode,completed){
 const dom=new JSDOM('<html><head></head><body><div class="work-page"><div class="calendar-week-time-event calendar-agenda-task '+mode+'"></div></div></body></html>'),document=dom.window.document;
 const style=document.createElement('style');style.textContent=fs.readFileSync('public/calendar.css','utf8');document.head.append(style);const row=document.querySelector('.calendar-week-time-event');
 const ctx={document,currentActor:'Рустам',calendarScope:'personal',sharedWritable:true,dateKey:'2026-11-05',todayState:()=>({key:'2026-11-05'}),calendarTaskCanReopen:()=>false,taskCompletionIsFuture:()=>false};
 vm.runInNewContext(source.slice(start,end)+';attachCompletion',ctx)(row,{id:'t',title:'Дело',personal:true,completed,externalCalendar:true});
 return{dom,button:row.querySelector('button')};
}
test('checked calendar cards use the same vector tick after reload as after completion',()=>{
 for(const mode of ['','is-concurrent','is-concurrent is-dense']){
  const f=checkbox(mode,true);try{assert.equal(f.button.getAttribute('aria-checked'),'true');assert.ok(f.button.querySelector('svg[viewBox="0 0 24 24"] path'));assert.equal(f.button.textContent,'')}finally{f.dom.window.close()}
 }
});
test('regular and compact checkbox circles have zero padding and square border-box sizing',()=>{
 for(const [mode,size]of [['','26px'],['is-concurrent','18px'],['is-concurrent is-dense','14px']]){
  const f=checkbox(mode,false);try{const style=f.dom.window.getComputedStyle(f.button);assert.equal(style.padding,'0px');assert.equal(style.boxSizing,'border-box');assert.equal(style.width,size);assert.equal(style.height,size);assert.equal(f.button.querySelector('svg'),null)}finally{f.dom.window.close()}
 }
});
