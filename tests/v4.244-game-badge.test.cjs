'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');

test('the Home games button shows a red dot without digits, even with two active games',()=>{
 const source=fs.readFileSync('public/rudi-games-extra.js','utf8');
 const badge={hidden:true,textContent:'',className:'',attributes:{},setAttribute(k,v){this.attributes[k]=v}};
 const button={
  child:null,title:'',label:'',
  classList:{toggle(){}},
  querySelector(selector){return selector==='.rudi-games-alert'?this.child:null},
  append(el){this.child=el},
  setAttribute(k,v){this[k]=v}
 };
 const document={
  hidden:false,readyState:'loading',body:{dataset:{rudiActor:'Рустам'},classList:{contains:()=>false}},
  getElementById(id){return id==='rudiHomeGamesButton'?button:null},
  querySelector(){return null},
  createElement(tag){assert.equal(tag,'i');return badge},
  addEventListener(){}
 };
 const badgeCalls=[];
 const navigator={
  onLine:false,
  setAppBadge(...args){badgeCalls.push(args);return Promise.resolve()},
  clearAppBadge(){badgeCalls.push(['clear']);return Promise.resolve()}
 };
 const window={
  RudiGames:{getMode:()=>null},
  addEventListener(){},location:{href:'https://example.test/?tab=home'},crypto:{}
 };
 const sandbox={document,navigator,window,URL,URLSearchParams,Intl,Date,Math,JSON,
  localStorage:{getItem(){return null},setItem(){}},
  setInterval(){return 1},clearInterval(){},setTimeout(){return 1},clearTimeout(){},
  fetch:()=>Promise.reject(new Error('No unexpected requests')),Promise};
 vm.runInNewContext(source,sandbox,{filename:'rudi-games-extra.js'});
 const ui=window.RudiGameExtras;
 assert.ok(ui);
 ui.updateOne('duel',{status:'playing',turn:'Рустам'});
 ui.updateOne('battleship',{status:'playing',turn:'Диана'});
 assert.equal(button.child,badge);
 assert.equal(badge.hidden,false);
 assert.equal(badge.textContent,'','two active games must never show 2');
 assert.equal(badgeCalls.length,1,'native badge must not update twice when both games are active');
 assert.deepEqual(Array.from(badgeCalls[0]),[],'native installed-PWA badge is a dot, not a number');
 ui.updateOne('duel',{status:'ended'});
 ui.updateOne('battleship',{status:'ended'});
 assert.equal(badge.hidden,true);
 assert.equal(badgeCalls.at(-1)[0],'clear');
});

test('CSS keeps dot inside the game button and overrides inherited span sizing',()=>{
 const css=fs.readFileSync('public/rudi-games.css','utf8');
 assert.match(css,/#rudiHomeGamesButton > \.rudi-games-alert\{/);
 assert.match(css,/top:5px!important;right:5px!important/);
 assert.match(css,/width:13px!important;height:13px!important/);
 assert.match(css,/font-size:0!important;line-height:0!important/);
 assert.match(css,/#rudiHomeGamesButton > \.rudi-games-alert\[hidden\]\{display:none!important\}/);
});

test('PWA and HTML versions fetch updated game badge assets without numeric OS badge',()=>{
 const sw=fs.readFileSync('public/sw.js','utf8');
 const html=fs.readFileSync('public/index.html','utf8');
 assert.match(sw,/CACHE_NAME='rudi-shell-v4\.\d+'/);
 // OS badge is now set only by verified live game state, not a game-start push.
 assert.doesNotMatch(sw,/self\.navigator\.setAppBadge\(/);
 assert.doesNotMatch(sw,/self\.navigator\.setAppBadge\(1\)/);
 assert.match(html,/rudi-games-extra\.js\?v=4\.\d+/);
 assert.match(html,/rudi-games\.css\?v=4\.244/);
 assert.match(fs.readFileSync('VERSION','utf8').trim(),/^v4\.\d+$/);
 assert.equal(JSON.parse(fs.readFileSync('rudi-version.json','utf8')).current,fs.readFileSync('VERSION','utf8').trim());
});
