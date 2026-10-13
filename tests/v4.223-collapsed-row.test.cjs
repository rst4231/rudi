'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs');
const css=fs.readFileSync('public/home-reference-layout.css','utf8');
const js=fs.readFileSync('public/home-reference-layout.js','utf8');
const current=css.slice(css.indexOf('/* RUDI v4.224'));
test('collapse details are truly removed only for collapsed profile',()=>{
 assert.match(current,/:has\(#displayName\)\.is-collapsed > \.rudi-collapse-body\{\s*display:none!important/);
 assert.doesNotMatch(current,/:not\(\.is-collapsed\) > \.rudi-collapse-body\{/);
 assert.match(js,/main\.append\(profileHead,energy\)/);
});
test('own card only; chart follows moving dot and ring strokes unchanged',()=>{
 assert.match(current,/:has\(#displayName\)/);
 assert.match(current,/\.rudi-home-self-line > \.profile-energy-strip\{/);
 assert.doesNotMatch(current,/\.rudi-fasting-progress-outline/);
 assert.match(css,/stroke-width:3px!important/);
 assert.match(css,/\.rudi-energy-point-caption/);
});
