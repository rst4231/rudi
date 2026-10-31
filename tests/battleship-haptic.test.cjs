const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
function fixture(telegram=true){
 const impacts=[],vibrations=[];
 const document={hidden:false,readyState:'loading',body:{dataset:{rudiActor:'Рустам'},classList:{contains:()=>false}},addEventListener(){},getElementById(){return null},querySelector(){return null}};
 const window={addEventListener(){},location:{href:'https://rudi.test/'},RudiGames:{getMode:()=>null},Telegram:telegram?{WebApp:{HapticFeedback:{impactOccurred:type=>impacts.push(type)}}}:undefined};
 const sandbox={window,document,navigator:{onLine:false,vibrate:pattern=>vibrations.push(pattern)},localStorage:{getItem(){return null}},setInterval(){},setTimeout(){},clearTimeout(){},URL,URLSearchParams,Date,Intl,Math,JSON};
 const source=fs.readFileSync('public/rudi-games-extra.js','utf8').replace('window.RudiGameExtras={','window.__acceptBattleRoom=acceptBattleRoom;window.RudiGameExtras={');
 vm.runInNewContext(source,sandbox);
 return {accept:room=>window.__acceptBattleRoom(room),impacts,vibrations,document};
}
const room=(version,enemyShots=[],extra={})=>({status:'playing',round:3,version,ownShips:[0,1,2],enemyShots,...extra});
test('only a new hit on my ship vibrates, with no replay on load, repeated poll or new round',()=>{
 const f=fixture();
 f.accept(room(1,[{cell:0,hit:true}]));assert.equal(f.impacts.length,0);
 f.accept(room(2,[{cell:0,hit:true},{cell:6,hit:false}]));assert.equal(f.impacts.length,0);
 f.accept(room(3,[{cell:0,hit:true},{cell:6,hit:false},{cell:1,hit:true}]));assert.deepEqual(f.impacts,['heavy']);
 f.accept(room(3,[{cell:0,hit:true},{cell:6,hit:false},{cell:1,hit:true}]));assert.equal(f.impacts.length,1);
 f.accept(room(4,[{cell:0,hit:true},{cell:1,hit:true},{cell:2,hit:true}],{status:'won'}));assert.equal(f.impacts.length,2);
 f.accept(room(5,[{cell:0,hit:true}],{round:4}));assert.equal(f.impacts.length,2);
});
test('own shots, stale replies and hidden pages do not vibrate; browser fallback works',()=>{
 const f=fixture(false);f.accept(room(1));
 f.accept(room(2,[],{ownShots:[{cell:0,hit:true}]}));assert.equal(f.vibrations.length,0);
 f.document.hidden=true;f.accept(room(3,[{cell:0,hit:true}]));assert.equal(f.vibrations.length,0);
 f.document.hidden=false;f.accept(room(3,[{cell:0,hit:true}]));assert.equal(f.vibrations.length,0);
 f.accept(room(2,[]));
 f.accept(room(4,[{cell:0,hit:true},{cell:1,hit:true}]));
 assert.equal(f.vibrations.length,1);assert.equal(JSON.stringify(f.vibrations[0]),'[90,40,90]');
});
test('first incoming hit also vibrates when the opponent starts right after both fleets become ready',()=>{
 const f=fixture();f.accept(room(1,[],{status:'placing',ready:{Рустам:true,Диана:false}}));
 f.accept(room(2,[{cell:0,hit:true}]));assert.deepEqual(f.impacts,['heavy']);
});
