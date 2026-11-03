'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs');
const {JSDOM}=require('jsdom');
const tick=()=>new Promise(resolve=>setImmediate(resolve));
for(const actor of ['Рустам','Диана'])test('partner task counts above supplements and safe remount: '+actor,async()=>{
 const dom=new JSDOM('<body data-app-tab="home"><section id="tile"><div class="profile-person-head"><div class="identity"><span class="partner-header-avatar">Фото</span><div class="person"><span id="partnerHeaderName">Партнёр</span></div></div></div><div class="profile-person-details"><div class="profile-supplement-intakes">БАДы партнёра</div></div></section></body>',{url:'https://rudi.test/',runScripts:'outside-only'});
 const {window:w}=dom;w.scrollTo=()=>{};w.fetch=async()=>({ok:true,json:async()=>({ok:true})});
 w.eval(fs.readFileSync('public/partner-profile.js','utf8'));
 let data={ok:true,partner:actor,available:true,total:8,counts:{morning:2,day:1,evening:3},workplace:'coworking',tomorrow:{available:true,total:4,counts:{morning:1,day:0,evening:2},workplace:'home'},title:'Нельзя показывать'};
 w.RudiPartnerProfile.bind(w.document.querySelector('#tile'),actor,{balance:()=>0,loadWishes:async()=>[],loadTaskCounts:async()=>data});
 const open=()=>w.document.querySelector('.partner-header-avatar').click();
 try{
  open();await tick();await tick();
  const card=w.document.querySelector('.partner-task-counts');assert.ok(card);
  assert.ok(card.nextElementSibling.classList.contains('partner-today'));
  assert.deepEqual([...card.querySelectorAll('[data-period]')].map(n=>n.textContent),['2','1','3','1','0','2']);
  assert.deepEqual([...card.querySelectorAll('thead th')].map(n=>n.textContent),['','Утром','Днём','Вечером','Всего']);
  assert.deepEqual([...card.querySelectorAll('tbody th[scope="row"]')].map(n=>n.firstChild.textContent),['Сегодня','Завтра']);
  assert.deepEqual([...card.querySelectorAll('.partner-task-total')].map(n=>n.textContent),['8','4']);
  assert.doesNotMatch(card.textContent,/Нельзя показывать/);
  const places=[...card.querySelectorAll('.partner-task-workplace')];
  if(actor==='Рустам'){
   assert.deepEqual(places.map(node=>node.textContent),['Коворкинг','Дома']);assert.ok(places.every(node=>!node.hidden));
  }else assert.ok(places.every(node=>node.hidden));
  w.document.querySelector('.partner-profile-back').click();assert.equal(w.document.querySelectorAll('.partner-task-counts').length,0);
  await tick();data={ok:true,partner:actor,available:false,counts:null,total:null};open();await tick();await tick();
  assert.equal(w.document.querySelectorAll('.partner-task-counts').length,1);
  assert.deepEqual([...w.document.querySelectorAll('[data-period]')].map(n=>n.textContent),['—','—','—','—','—','—']);
  assert.match(w.document.querySelector('.partner-task-counts').textContent,/Не удалось/);
  assert.ok([...w.document.querySelectorAll('.partner-task-workplace')].every(node=>node.hidden));
 }finally{w.close()}
});
test('business table palette switches with theme and retains readable text contrast',()=>{
 const dom=new JSDOM('<html data-theme="light"><head><style>'+fs.readFileSync('public/partner-profile.css','utf8')+'</style></head><body><div class="partner-profile-page"><section class="partner-task-counts"></section></div></body></html>');
 const luminance=hex=>{
  const values=hex.replace('#','').match(/../g).map(v=>parseInt(v,16)/255).map(v=>v<=.04045?v/12.92:((v+.055)/1.055)**2.4);
  return values[0]*.2126+values[1]*.7152+values[2]*.0722;
 };
 const contrast=(a,b)=>{const x=luminance(a),y=luminance(b);return (Math.max(x,y)+.05)/(Math.min(x,y)+.05)};
 try{
  const palettes=[];
  for(const theme of ['light','dark']){
   dom.window.document.documentElement.dataset.theme=theme;
   const style=dom.window.getComputedStyle(dom.window.document.querySelector('.partner-task-counts'));
   const palette=Object.fromEntries(['ink','muted','head','total'].map(k=>[k,style.getPropertyValue('--pt-'+k).trim()]));
   assert.ok(contrast(palette.muted,palette.head)>=4.5,theme+' header contrast');
   assert.ok(contrast(palette.ink,palette.total)>=4.5,theme+' total contrast');palettes.push(palette);
  }
  assert.notDeepEqual(palettes[0],palettes[1]);
 }finally{dom.window.close()}
});
