'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs');
const css=fs.readFileSync('public/home-reference-layout.css','utf8');
const js=fs.readFileSync('public/home-reference-layout.js','utf8');
test('collapsed details are suppressed, but expanded details still exist and work',()=>{
 const rules=css.slice(css.indexOf('/* RUDI v4.223'));
 assert.match(rules,/\.is-collapsed > \.rudi-collapse-body\{\s*display:none!important/);
 assert.doesNotMatch(rules,/\.is-collapsed > \.rudi-home-self-line\{\s*display:none/);
 assert.doesNotMatch(rules,/:not\(\.is-collapsed\)[\s\S]*?\.rudi-collapse-body/);
 assert.match(js,/main\.append\(profileHead,energy\)/);
});
test('only own profile is affected, graph and tracker halo survive',()=>{
 const rules=css.slice(css.indexOf('/* RUDI v4.223'));
 assert.match(rules,/:has\(#displayName\)\.is-collapsed/);
 assert.doesNotMatch(rules,/rudi-fasting-progress-outline/);
 assert.match(css,/stroke-width:3px!important/);
 assert.match(css,/\.rudi-energy-point-caption/);
});
