'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');

const navJs=fs.readFileSync('public/finance-nav-icons.js','utf8');
const navCss=fs.readFileSync('public/finance-nav-icons.css','utf8');
const game=fs.readFileSync('public/rudi-games.js','utf8');
const gameCss=fs.readFileSync('public/rudi-games.css','utf8');

test('finance tabs are promoted outside transformed page and pinned like home nav',()=>{
 assert.match(navJs,/document\.body\.appendChild\(nav\)/);
 assert.match(navCss,/body\s*>\s*#financeTabs\.rudi-finance-icon-nav\s*\{/);
 assert.match(navCss,/position:fixed!important/);
 assert.match(navCss,/bottom:0!important/);
 assert.match(navCss,/@media\(max-width:430px\)/);
 assert.match(navCss,/width:100%!important/);
 assert.doesNotMatch(navCss,/#financePage\s+#financeTabs/);
 assert.match(navCss,/rudi-finance-nav-suppressed/);
 for(const cls of ['is-personal-history','is-category-history','is-expense-history','is-income-history','is-capital-history']){
   assert.ok(navJs.includes(cls),'history subpage must hide finance tabs: '+cls);
 }
 assert.match(navCss,/rudi-literacy-unread/);
 assert.match(navJs,/function updateBadge\(\)/);
});

test('games are moved to the existing Quick Access layout, not profile shortcuts',()=>{
 assert.match(game,/document\.querySelector\('#quickAccessTile \.quick-access-actions'\)/);
 assert.match(game,/id='quickGamesButton'/);
 assert.match(game,/className='quick-access-button is-games'/);
 assert.doesNotMatch(game,/document\.querySelector\('\.mood-self-buttons'\)/);
 assert.match(gameCss,/\.quick-access-button\.is-games/);
 assert.match(game,/data-rudi-game="duel"/);
});

function duelFixture(){
 const start=game.indexOf('const DUEL_LINES=');
 const end=game.indexOf('function open(){',start);
 assert.ok(start>0&&end>start,'duel logic should exist');
 const data=new Map();
 const storage={getItem:key=>data.has(key)?data.get(key):null,setItem:(key,value)=>data.set(key,value)};
 const logic=game.slice(start,end);
 const factory=new Function('localStorage',
   "let mode='home',memoryTimer=null,duelCells=Array(9).fill(''),duelTurn='Рустам',duelWinner='',duelWins=[],duelDone=false;"+
   'let lastHtml="";function header(){}function section(html){lastHtml=html}'+logic+
   'return {start:duelStart,move:duelMove,score:duelScore,state:()=>({cells:[...duelCells],turn:duelTurn,winner:duelWinner,done:duelDone,html:lastHtml})};');
 return factory(storage);
}
test('two players alternate, invalid moves are ignored, and victories persist exactly once',()=>{
 const g=duelFixture();
 g.start();assert.equal(g.state().turn,'Рустам');
 g.move(0);assert.equal(g.state().turn,'Диана');
 g.move(0);assert.equal(g.state().turn,'Диана'); // same square is not replayed
 g.move(3);g.move(1);g.move(4);g.move(2);
 assert.equal(g.state().winner,'Рустам');
 assert.equal(g.state().done,true);
 assert.equal(g.score().rustam,1);
 g.move(5);g.move(8);
 assert.equal(g.score().rustam,1); // no double count after round end
 assert.match(g.state().html,/Победа: Рустам/);
 g.start();assert.equal(g.state().turn,'Диана'); // alternate first move
 g.move(0);g.move(3);g.move(1);g.move(4);g.move(2);
 assert.equal(g.state().winner,'Диана');
 assert.equal(g.score().diana,1);
 assert.equal(g.score().rustam,1);
});
test('resetting an unfinished duel does not affect the result counters',()=>{
 const g=duelFixture();
 g.start();g.move(4);g.start();
 assert.equal(g.score().rustam,0);
 assert.equal(g.score().diana,0);
 assert.equal(g.score().draws,0);
 assert.ok(g.state().cells.every(cell=>!cell));
});
