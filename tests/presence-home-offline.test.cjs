'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),{JSDOM}=require('jsdom');
test('offline and online home profiles retain their original work and rhythm statuses',()=>{
 const dom=new JSDOM('<html><head></head><body data-app-tab="home" class="auth-ok">'+['Rustam','Diana'].map(name=>'<section id="home'+name+'Tile"><div class="profile-person-head"><span class="score-avatar-wrap"></span><div class="person"><div class="profile-name-row">Имя</div><div class="profile-work-status">Работаю</div><div class="profile-rhythm-status">Отдыхаю</div><div class="profile-cycle-mood">Статус</div></div></div></section>').join('')+'</body></html>');
 try{
 const document=dom.window.document;Object.defineProperty(document,'visibilityState',{value:'visible'});const style=document.createElement('style');style.textContent=fs.readFileSync('public/presence.css','utf8');document.head.append(style);
 const source=fs.readFileSync('public/presence.js','utf8'),clock=Date.parse('2026-11-04T19:45:00Z');
 const ctx={document,navigator:{onLine:true},Intl,Date:class extends Date{static now(){return clock}}};
 vm.runInNewContext(source.slice(source.indexOf(' const ACTORS='),source.indexOf(' async function ping'))+";lastResponse=Date.now();lastSeen={'Рустам':'2026-11-04T19:40:00Z','Диана':'2026-11-04T19:41:00Z'};globalThis.api={paint,setOnline(actor,value){status[actor]=value}};",ctx);
 ctx.api.paint();for(const [id,actor]of [['homeRustamTile','Рустам'],['homeDianaTile','Диана']]){
  const person=document.querySelector('#'+id+' .person');
  for(const online of [false,true,false]){
   ctx.api.setOnline(actor,online);ctx.api.paint();
   assert.equal(person.querySelector('.home-presence-status'),null);
   for(const status of person.querySelectorAll('.profile-work-status,.profile-rhythm-status,.profile-cycle-mood'))assert.notEqual(dom.window.getComputedStyle(status).display,'none');
   assert.equal(document.querySelector('#'+id+' .rudi-online-dot').classList.contains('is-online'),online);
  }
 }
 }finally{dom.window.close()}
});
test('last visit is a compact time-only caption inside each avatar, hidden online or without a valid visit',()=>{
 const dom=new JSDOM('<html><head></head><body data-app-tab="home" class="auth-ok">'+['Rustam','Diana'].map(name=>'<section id="home'+name+'Tile" class="profile-person-card"><span class="score-avatar-wrap"></span><div class="person">Имя</div></section>').join('')+'</body></html>');
 try{
  const document=dom.window.document;Object.defineProperty(document,'visibilityState',{value:'visible'});
  const style=document.createElement('style');style.textContent=fs.readFileSync('public/presence.css','utf8');document.head.append(style);
  const source=fs.readFileSync('public/presence.js','utf8'),clock=Date.parse('2026-11-04T19:45:00Z');
  const ctx={document,navigator:{onLine:true},Intl,Date:class extends Date{static now(){return clock}}};
  vm.runInNewContext(source.slice(source.indexOf(' const ACTORS='),source.indexOf(' async function ping'))+";lastResponse=Date.now();globalThis.api={paint,setOnline(actor,value){status[actor]=value},setSeen(actor,value){lastSeen[actor]=value}};",ctx);
  for(const [id,actor,time,visit]of [['homeRustamTile','Рустам','22:40','2026-11-04T19:40:00Z'],['homeDianaTile','Диана','22:41','2026-11-03T19:41:00Z']]){
   ctx.api.setSeen(actor,visit);ctx.api.paint();ctx.api.paint();
   const holder=document.querySelector('#'+id+' .score-avatar-wrap'),line=holder.querySelector('.rudi-avatar-last-seen');
   assert.ok(line);assert.equal(holder.querySelectorAll('.rudi-avatar-last-seen').length,1);assert.equal(line.textContent,time);assert.equal(line.hidden,false);
   assert.equal(dom.window.getComputedStyle(line).position,'absolute');assert.equal(line.getAttribute('datetime'),visit);
   ctx.api.setOnline(actor,true);ctx.api.paint();assert.equal(line.hidden,true);assert.equal(line.textContent,'');
   ctx.api.setOnline(actor,false);ctx.api.paint();assert.equal(line.hidden,false);assert.equal(line.textContent,time);
   for(const value of [null,'invalid','2026-11-05T10:00:00Z']){ctx.api.setSeen(actor,value);ctx.api.paint();assert.equal(line.hidden,true);assert.equal(line.textContent,'')}
  }
 }finally{dom.window.close()}
});
