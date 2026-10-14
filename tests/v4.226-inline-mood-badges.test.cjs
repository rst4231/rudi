'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs');
const css=fs.readFileSync('public/home-reference-layout.css','utf8');
const js=fs.readFileSync('public/home-reference-layout.js','utf8');
const html=fs.readFileSync('public/index.html','utf8');
const scope=css.slice(css.indexOf('/* RUDI v4.226:'));
test('both native mood controls relocate to their real name rows',()=>{
 assert.match(js,/function placeMoodBadgesByName\(\)/);
 assert.match(js,/\['homeRustamTile','homeDianaTile'\]/);
 assert.match(js,/tile\?\.querySelector\('#moodCurrentButton,#partnerMoodValue'\)/);
 assert.match(js,/badge\.parentElement!==row\)row\.appendChild\(badge\)/);
 assert.match(js,/placeMoodBadgesByName\(\);/);
});
test('partner empty mood is genuinely hidden and selected badges match as circles',()=>{
 assert.match(scope,/\.profile-name-row > #partnerMoodValue\[hidden\]/);
 assert.match(scope,/display:none!important/);
 assert.match(scope,/\.avatar-mood-badge\{/);
 assert.match(scope,/border-radius:50%!important/);
 assert.match(scope,/\.partner-mood-icon\[hidden\]/);
});
test('own unset mood no white background but stays clickable for mood selection',()=>{
 assert.match(scope,/#moodCurrentButton\.is-empty\{/);
 assert.match(scope,/background:transparent!important/);
 assert.match(scope,/#moodCurrentButton\.is-empty::after\{/);
});
test('self lower padding shrinks and name gets space without changing overall width',()=>{
 assert.match(js,/'min-height':'82px','padding-top':'6px','padding-bottom':'3px'/);
 assert.match(js,/grid-template-columns':narrow\?'minmax\(0,53%\)/);
 assert.match(scope,/padding-bottom:3px!important/);
 assert.match(html,/home-reference-layout\.css\?v=4\.227/);
 assert.match(html,/home-reference-layout\.js\?v=4\.227/);
});
test('shortcuts retain v4.225 dark-mode surface in the light app theme',()=>{
 assert.match(css,/html\[data-theme="light"\] body\[data-app-tab="home"\] \.rudi-home-shortcuts\{/);
 assert.match(css,/background:linear-gradient\(155deg,#1d2036 0%,#141728 100%\)!important/);
});
