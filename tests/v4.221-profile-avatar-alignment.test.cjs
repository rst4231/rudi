'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs');
const css=fs.readFileSync('public/home-reference-layout.css','utf8');
const html=fs.readFileSync('public/index.html','utf8');
const latest=css.slice(css.indexOf('/* RUDI v4.221:'));
test('avatar and name/status share centered identity alignment',()=>{
 assert.match(latest,/\.profile-person-head > \.identity\{[\s\S]*?align-items:center!important/);
 assert.match(latest,/\.profile-person-head \.identity > \.person\{[\s\S]*?justify-content:center!important/);
 assert.match(latest,/\.profile-person-head \.identity > \.person > \.profile-name-row\{/);
 assert.match(latest,/\.profile-work-status,\.profile-cycle-mood,\.profile-rhythm-status/);
});
test('mood emoji is positioned relative to avatar away from text',()=>{
 assert.match(latest,/\.score-avatar-wrap > :is\(#moodCurrentButton,#partnerMoodValue\)\.avatar-mood-badge\{/);
 assert.match(latest,/top:-5px!important/);
 assert.match(latest,/right:-2px!important/);
 assert.match(latest,/width:24px!important/);
});
test('preserves existing full-width compact card, inline chart and cached version',()=>{
 assert.match(css,/RUDI v4\.220: reference self card/);
 assert.match(css,/grid-template-columns:minmax\(0,43%\) minmax\(0,1fr\)!important/);
 assert.match(css,/\.rudi-energy-point-caption\{/);
 assert.match(html,/home-reference-layout\.css\?v=4\.221/);
});
