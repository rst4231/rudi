'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),{JSDOM}=require('jsdom');
test('offline profiles show only last visit and restore work/rhythm statuses when online',()=>{
 const dom=new JSDOM('<html><head></head><body data-app-tab="home" class="auth-ok">'+['Rustam','Diana'].map(name=>'<section id="home'+name+'Tile"><div class="profile-person-head"><span class="score-avatar-wrap"></span><div class="person"><div class="profile-name-row">Имя</div><div class="profile-work-status">Работаю</div><div class="profile-rhythm-status">Отдыхаю</div><div class="profile-cycle-mood">Статус</div></div></div></section>').join('')+'</body></html>');
 try{
 const document=dom.window.document;Object.defineProperty(document,'visibilityState',{value:'visible'});const style=document.createElement('style');style.textContent=fs.readFileSync('public/presence.css','utf8');document.head.append(style);
 const source=fs.readFileSync('public/presence.js','utf8'),clock=Date.parse('2026-11-04T19:45:00Z');
 const ctx={document,navigator:{onLine:true},Intl,Date:class extends Date{static now(){return clock}}};
 vm.runInNewContext(source.slice(source.indexOf(' const ACTORS='),source.indexOf(' async function ping'))+";lastResponse=Date.now();lastSeen={'Рустам':'2026-11-04T19:40:00Z','Диана':'2026-11-04T19:41:00Z'};globalThis.api={paint,setOnline(actor,value){status[actor]=value}};",ctx);
 ctx.api.paint();for(const [id,actor,time]of [['homeRustamTile','Рустам','22:40'],['homeDianaTile','Диана','22:41']]){
  const person=document.querySelector('#'+id+' .person'),line=person.querySelector('.home-presence-status');assert.ok(line);assert.ok(line.textContent.includes(time));assert.equal(line.hidden,false);
  for(const status of person.querySelectorAll('.profile-work-status,.profile-rhythm-status,.profile-cycle-mood'))assert.equal(dom.window.getComputedStyle(status).display,'none');
  ctx.api.setOnline(actor,true);ctx.api.paint();assert.equal(line.hidden,true);assert.notEqual(dom.window.getComputedStyle(person.querySelector('.profile-work-status')).display,'none');
 }
 }finally{dom.window.close()}
});
