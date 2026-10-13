'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs');
const css=fs.readFileSync('public/home-reference-layout.css','utf8');
const html=fs.readFileSync('public/index.html','utf8');
const latest=css.slice(css.indexOf('/* RUDI v4.223'));
test('collapsed self tile is a real flex layout, not the previous three-row grid',()=>{
 assert.match(latest,/\.is-collapsed\{[\s\S]*?display:flex!important/);
 assert.match(latest,/\.is-collapsed > \.rudi-collapse-body\{\s*display:none!important/);
 assert.match(latest,/\.is-collapsed > \.rudi-home-self-line\{[\s\S]*?grid-template-columns:minmax\(0,43%\) minmax\(0,1fr\)!important/);
 assert.doesNotMatch(latest,/grid-auto-rows:min-content!important/);
});
test('profile photo, name/status and live biorhythm share a single centered track',()=>{
 assert.match(latest,/\.rudi-home-self-line > \.profile-person-head\{[\s\S]*?align-items:center!important/);
 assert.match(latest,/\.profile-person-head > \.identity\{[\s\S]*?align-items:center!important/);
 assert.match(latest,/\.profile-person-head \.identity > \.person\{[\s\S]*?justify-content:center!important/);
 assert.match(latest,/\.rudi-home-self-line > \.profile-energy-strip\{[\s\S]*?grid-column:2!important;\s*grid-row:1!important/);
});
test('emoji remains anchored on the avatar; no legacy v4.221/222 cascade remains',()=>{
 assert.match(latest,/\.score-avatar-wrap > :is\(#moodCurrentButton,#partnerMoodValue\)\.avatar-mood-badge\{[\s\S]*?top:-3px!important/);
 assert.doesNotMatch(css,/\/\* RUDI v4\.221: align the personal identity group/);
 assert.doesNotMatch(css,/\/\* RUDI v4\.222: fix the entire self tile/);
 assert.match(html,/home-reference-layout\.css\?v=4\.223/);
});
