'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs');
const battle=require('../api/battleship-game.cjs');
const ships=()=>[0,1,2,14,15,28,29];
const js=fs.readFileSync('public/rudi-games-extra.js','utf8');
const css=fs.readFileSync('public/rudi-games.css','utf8');
const menu=fs.readFileSync('public/rudi-games.js','utf8');
const html=fs.readFileSync('public/index.html','utf8');
const sw=fs.readFileSync('public/sw.js','utf8');

test('only fully sunk vessels are revealed, not the other hidden enemy positions',()=>{
 let room=battle.nextMove(null,'Рустам','start',null,undefined,ships).room;
 for(const i of [0,1]){
  room=battle.nextMove(room,'Рустам','move',i).room;
  const publicView=battle.publicRoom(room,'Рустам');
  assert.deepEqual(publicView.sunkShips,[]);
  assert.equal(publicView.opponentShips,undefined);
 }
 room=battle.nextMove(room,'Рустам','move',2).room;
 const view=battle.publicRoom(room,'Рустам');
 assert.deepEqual(view.sunkShips,[[0,1,2]]);
 assert.equal(view.opponentShips,undefined);
 assert.equal(room.turn,'Рустам','a hit keeps the turn');
 assert.equal(room.status,'playing');
 room=battle.nextMove(room,'Рустам','move',14).room;
 assert.deepEqual(battle.publicRoom(room,'Рустам').sunkShips,[[0,1,2]]);
 room=battle.nextMove(room,'Рустам','move',15).room;
 assert.deepEqual(battle.publicRoom(room,'Рустам').sunkShips,[[0,1,2],[14,15]]);
 assert.deepEqual(battle.publicRoom(room,'Диана').sunkShips,[]);
});
test('ship grouping handles horizontal, vertical and isolated cells without wrap',()=>{
 assert.deepEqual(battle.vesselGroups([2,0,1,14,21,28,48]),[[0,1,2],[14,21,28],[48]]);
 assert.deepEqual(battle.vesselGroups([6,7]),[[6],[7]]);
});
test('shots use reference target markers, complete ships via grid spans, and mute is available',()=>{
 assert.match(js,/rudi-battle-fire/);
 assert.match(js,/rudi-battle-target-dot/);
 assert.match(js,/rudi-battle-splash[^>]*>×/);
 assert.match(js,/battleShips\(kind,room,hitmap\)/);
 assert.match(js,/grid-row:.*span.*grid-column:/s);
 assert.match(js,/rudi-battle-vessel-wreck/);
 assert.match(js,/function playBattleSound\(kind\)/);
 assert.match(js,/AudioContext\|\|window\.webkitAudioContext/);
 assert.match(js,/data-battle-sound/);
 assert.match(js,/playBattleSound\('fire'\)/);
 assert.match(js,/playBattleSound\(sunk\?'sunk'/);
 assert.match(css,/\.rudi-battle-vessel\.is-sunk \.rudi-battle-vessel-wreck/);
 assert.match(css,/pointer-events:none/);
 assert.match(css,/@media\(max-width:370px\)/);
});
test('remove automatic ship hint / square hint / red cross hint and collapse spacing',()=>{
 for(const phrase of ['Нажми на клетку, чтобы выстрелить','Красный крест — попадание',
                     'Корабли размещаются автоматически','Синий квадрат — часть корабля']){
  assert.ok(!js.includes(phrase),phrase);
 }
 assert.ok(!menu.includes('корабли расставляются автоматически'));
 assert.match(css,/\.rudi-battle-work section\{gap:5px;/);
 assert.match(css,/\.rudi-battle-work section h2\{margin:0 0 3px/);
});
test('new static resources and the offline shell use the same release version',()=>{
 for(const name of ['rudi-games.js','rudi-games-extra.js','rudi-games.css']){
  const url=html.match(new RegExp('/'+name.replace(/\./g,'\\.')+'\\?v=[^\"\\s]+'));
  assert.ok(url,name+' HTML');
  assert.ok(sw.includes(url[0]),name+' same URL in SW');
 }
 assert.match(sw,/rudi-shell-v4\.\d+/);
 assert.equal(fs.readFileSync('VERSION','utf8').trim(),fs.readFileSync('VERSION','utf8').trim());
 assert.equal(JSON.parse(fs.readFileSync('rudi-version.json','utf8')).current,fs.readFileSync('VERSION','utf8').trim());
});
