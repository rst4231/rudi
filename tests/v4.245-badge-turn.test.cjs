'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');

function fixture(actor){
 const source=fs.readFileSync('public/rudi-games-extra.js','utf8');
 const states=[],badge={hidden:true,textContent:'',setAttribute(){}},calls=[];
 const button={
  title:'',child:null,classList:{toggle(name,flag){states.push({name,flag})}},
  querySelector(sel){return sel==='.rudi-games-alert'?this.child:null},
  append(el){this.child=el},
  setAttribute(name,value){this[name]=value}
 };
 const cards=Object.fromEntries(['duel','battleship'].map(name=>{
  const copy={append(el){this.chip=el}};
  const card={copy,active:false,classList:{toggle(_name,flag){card.active=flag}},
   querySelector(sel){return sel==='.rudi-game-live-chip'?copy.chip:sel==='.rudi-game-card-copy'?copy:null}};
  return [name,card];
 }));
 const document={
  hidden:false,readyState:'loading',
  body:{dataset:{rudiActor:actor},classList:{contains:()=>false}},
  getElementById(id){return id==='rudiHomeGamesButton'?button:null},
  querySelector(query){const name=/data-rudi-game="(duel|battleship)"/.exec(query)?.[1];return cards[name]||null},
  createElement(tag){if(tag==='i')return badge;if(tag==='em')return {hidden:true,textContent:''};throw Error('unexpected tag '+tag)},
  addEventListener(){}
 };
 const navigator={
  onLine:false,
  setAppBadge(...args){calls.push(['set',...args]);return Promise.resolve()},
  clearAppBadge(){calls.push(['clear']);return Promise.resolve()}
 };
 const window={RudiGames:{getMode:()=> 'home'},addEventListener(){},crypto:{},
  location:{href:'https://example.test/?tab=home'}};
 const ctx={document,navigator,window,URL,URLSearchParams,Intl,Date,Math,JSON,
  localStorage:{getItem(){return null},setItem(){}},
  setInterval(){return 1},clearInterval(){},setTimeout(){return 1},clearTimeout(){},
  fetch:()=>Promise.reject(Error('No game status fetch expected')),Promise};
 vm.runInNewContext(source,ctx,{filename:'rudi-games-extra.js'});
 return {update:window.RudiGameExtras.updateOne,render:window.RudiGameExtras.renderBadges,
  button,badge,calls,cards,states};
}
for(const name of ['Рустам','Диана']){
 test('Home and PWA badge follow '+name+"'s turn, not just a playing match",()=>{
  const f=fixture(name),other=name==='Рустам'?'Диана':'Рустам';
  f.render();assert.equal(f.badge.hidden,true);
  f.update('duel',{status:'playing',turn:other});
  f.update('battleship',{status:'playing',turn:other});
  assert.equal(f.badge.hidden,true,'Both games active but opponent turns: hide red dot');
  assert.equal(f.button.title,'Игры · партия начата');
  assert.equal(f.cards.duel.copy.chip.textContent,'Игра начата');
  assert.equal(f.cards.battleship.copy.chip.textContent,'Игра начата');
  assert.equal(f.cards.duel.active,true);
  assert.equal(f.calls.filter(([action])=>action==='set').length,0);
  f.update('battleship',{status:'playing',turn:name});
  assert.equal(f.badge.hidden,false);
  assert.equal(f.badge.textContent,'');
  assert.equal(f.cards.battleship.copy.chip.textContent,'Твой ход');
  assert.equal(f.button.title,'Игры · твой ход');
  assert.equal(f.calls.filter(([action])=>action==='set').length,1);
  assert.equal(f.calls.at(-1).length,1,'Native badge is a dot, no counter');
  f.update('battleship',{status:'playing',turn:other});
  assert.equal(f.badge.hidden,true,'Hide as soon as own turn finishes');
  assert.equal(f.cards.battleship.active,true,'Keep started game card status');
  assert.equal(f.cards.battleship.copy.chip.textContent,'Игра начата');
  assert.equal(f.calls.at(-1)[0],'clear','Clear installed-PWA badge when turn passes');
  f.update('duel',{status:'playing',turn:name});
  assert.equal(f.badge.hidden,false,'Either online game can require a move');
  f.update('duel',{status:'won',turn:''});
  assert.equal(f.badge.hidden,true,'Hide after game ends');
 });
}
test('background start push never sets an unverified red PWA badge',()=>{
 const sw=fs.readFileSync('public/sw.js','utf8');
 assert.doesNotMatch(sw,/badgeNewGamePush|self\.navigator\.setAppBadge/);
 assert.match(sw,/deliverDirectPushNotification\(row\)/);
 assert.match(sw,/registration\.showNotification\(/);
 assert.match(sw,/CACHE_NAME='rudi-shell-v4\.245'/);
});
test('turn-only source and offline assets use the current release',()=>{
 const js=fs.readFileSync('public/rudi-games-extra.js','utf8');
 const html=fs.readFileSync('public/index.html','utf8');
 assert.match(js,/badge\.hidden=mine===0/);
 assert.match(js,/const badgeActive=myTurns\(\)>0/);
 assert.match(js,/card\.classList\.toggle\('has-live-game',!!text\)/);
 assert.match(html,/rudi-games-extra\.js\?v=4\.245/);
 assert.equal(fs.readFileSync('VERSION','utf8').trim(),'v4.245');
 assert.equal(JSON.parse(fs.readFileSync('rudi-version.json','utf8')).current,'v4.245');
});