'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const css=fs.readFileSync('public/home-reference-layout.css','utf8');
const html=fs.readFileSync('public/index.html','utf8');
const js=fs.readFileSync('public/home-reference-layout.js','utf8');
const latest=css.slice(css.indexOf('/* RUDI v4.233:'));
test('shortcuts use the same full width as Home car card and equal idle top/bottom padding',()=>{
 assert.match(latest,/\.rudi-home-shortcuts\{[\s\S]*?width:100%!important/);
 assert.match(latest,/max-width:100%!important/);
 assert.match(latest,/box-sizing:border-box!important/);
 assert.match(latest,/padding-bottom:var\(--rudi-shortcuts-idle-padding,11px\)!important/);
 assert.match(latest,/--rudi-shortcuts-idle-padding:9px/);
});
test('fasting caption alone adds extra padding and hidden/empty timer cannot trigger it',()=>{
 assert.match(latest,/:has\(#fastingProfileElapsed:not\(\[hidden\]\):not\(:empty\)\)/);
 assert.match(latest,/padding-bottom:23px!important/);
 assert.match(css,/\.rudi-home-shortcuts \[hidden\]\{display:none!important\}/);
});
test('Diana partner card is compact and responsive with unchanged graph and native actions',()=>{
 const d=latest.slice(latest.indexOf('/* Diana as PARTNER'),latest.indexOf('/* RUDI v4.234: energy dot interactions'));
 assert.doesNotMatch(d,/#homeRustamTile/);
 assert.match(d,/#homeDianaTile:not\(:has\(#displayName\)\)/);
 assert.match(d,/grid-template-columns:minmax\(0,43%\) minmax\(0,1fr\) auto!important/);
 assert.match(d,/> \.profile-person-head\{[\s\S]*?display:contents!important/);
 assert.match(d,/> \.profile-energy-strip\{[\s\S]*?grid-column:2!important/);
 assert.match(d,/> \.profile-person-actions\{[\s\S]*?grid-column:3!important/);
 assert.match(d,/> \.profile-person-actions\{[\s\S]*?position:static!important/);
 assert.match(d,/> \.profile-person-actions\{[\s\S]*?inset:auto!important/);
 assert.match(d,/\.profile-person-actions > \.block-collapse-button\{\s*display:none!important/);
 assert.match(d,/> \.rudi-collapse-body\{[\s\S]*?grid-row:2!important/);
});
test('Rustam layout JS, native partner contacts and PWA version remain consistent',()=>{
 assert.match(js,/return layoutLiveRustamV4229\(self,main,profileHead,energy\)/);
 assert.match(html,/home-reference-layout\.css\?v=4\.234/);
 assert.match(html,/home-reference-layout\.js\?v=4\.234/);
 assert.match(fs.readFileSync('public/sw.js','utf8'),/rudi-shell-v4\.234/);
});
