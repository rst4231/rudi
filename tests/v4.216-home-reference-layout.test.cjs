'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs');
const src=p=>fs.readFileSync(p,'utf8');
test('reference hero is narrower horizontally while preserving its original height',()=>{
 const css=src('public/home-reference-layout.css');
 assert.match(css,/home-dashboard-summary\{[\s\S]{0,110}width:96%!important/);
 const hero=css.match(/home-dashboard-summary\\{[\\s\\S]*?\\}/)?.[0]||'';
 assert.doesNotMatch(hero,/min-height:0!important/);
});
test('six shortcuts sit before conditional meditation hint and profile',()=>{
 const js=src('public/home-reference-layout.js'),css=src('public/home-reference-layout.css');
 assert.match(js,/rudiHomeShortcuts/);
 assert.match(js,/const anchor=hint&&hint.parentElement===self.parentElement&&!hint.hidden\?hint:self/);
 assert.match(js,/anchor.parentElement.insertBefore\(rail,anchor\)/);
 assert.match(css,/width:min\(92%,470px\)/);
 assert.match(css,/\.rudi-home-self-line/);
});
test('games button is executable and its scripts are loaded',()=>{
 const html=src('public/index.html'),code=src('public/home-reference-layout.js');
 assert.match(html,/rudi-games\.js\?v=4\.216/);
 assert.match(html,/rudi-games\.css\?v=4\.216/);
 assert.match(code,/window\.RudiGames\?\.open\?\.\(\)/);
});
test('OKX UI assets are cache-busted, but Bybit history stays visible',()=>{
 const html=src('public/index.html');
 assert.match(html,/crypto-algorithms\.js\?v=4\.216/);
 assert.match(html,/OKX · новые сделки/);
 assert.match(html,/Bybit · архив/);
});
test('reference layout and games are precached for offline use',()=>{
 const build=src('build.cjs');
 for(const file of ['home-reference-layout.css','home-reference-layout.js','rudi-games.js','rudi-games.css'])
  assert.ok(build.includes(file),file);
});

test('hidden tracker controls and badges are not forced visible in compact rail',()=>{
 const css=src('public/home-reference-layout.css');
 assert.match(css,/rudi-home-shortcuts \\[hidden\\]\\{display:none!important\\}/);
});
