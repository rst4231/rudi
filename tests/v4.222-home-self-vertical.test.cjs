'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs');
const css=fs.readFileSync('public/home-reference-layout.css','utf8');
const html=fs.readFileSync('public/index.html','utf8');
const latest=css.slice(css.indexOf('/* RUDI v4.222:'));
test('self tile centers the entire row, without altering biorhythm grid or width',()=>{
 assert.match(latest,/align-content:center!important/);
 assert.match(latest,/grid-auto-rows:min-content!important/);
 assert.match(latest,/min-height:76px!important/);
 assert.match(latest,/height:72px!important/);
 assert.doesNotMatch(latest,/grid-template-columns:minmax\(0,43%\)/);
 assert.doesNotMatch(latest,/\.profile-energy-plot\{/);
});
test('avatar, name and status align to the same centered axis',()=>{
 assert.match(latest,/\.profile-person-head > \.identity\{[\s\S]*?align-items:center!important/);
 assert.match(latest,/\.profile-person-head \.score-avatar-wrap\{[\s\S]*?align-self:center!important/);
 assert.match(latest,/\.profile-person-head \.identity > \.person\{[\s\S]*?justify-content:center!important/);
 assert.match(latest,/\.profile-person-head \.identity > \.person > :is\(\.profile-work-status,\.profile-cycle-mood\)\{/);
});
test('emoji anchors to its photo and remains small on narrow phones',()=>{
 assert.match(latest,/\.score-avatar-wrap > :is\(#moodCurrentButton,#partnerMoodValue\)\.avatar-mood-badge\{[\s\S]*?top:-3px!important/);
 assert.match(latest,/width:22px!important/);
 assert.match(latest,/@media\(max-width:375px\)/);
 assert.match(html,/home-reference-layout\.css\?v=4\.222/);
});
