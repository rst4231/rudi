'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs');
const css=fs.readFileSync('public/home-reference-layout.css','utf8');
const rules=css.slice(css.indexOf('/* RUDI v4.224'));
test('all self alignment rules work regardless of is-collapsed',()=>{
 const selectors=rules.match(/body\[data-app-tab="home"\][^\{]+\{/g)||[];
 assert.ok(selectors.length>15);
 assert.ok(selectors.some(s=>s.includes(':has(#displayName) > .rudi-home-self-line')));
 assert.ok(selectors.some(s=>s.includes(':has(#displayName) .profile-person-head > .identity')));
 assert.ok(!selectors.some(s=>s.includes('.is-collapsed .profile-person-head')));
});
test('card is compact and not grid-autoplaced with phantom detail row',()=>{
 assert.match(rules,/grid-auto-rows:auto!important/);
 assert.match(rules,/min-height:90px!important/);
 assert.match(rules,/max-height:72px!important/);
 assert.match(rules,/\.is-collapsed > \.rudi-collapse-body\{\s*display:none!important/);
});
