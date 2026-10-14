'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs');
const css=fs.readFileSync('public/home-reference-layout.css','utf8');
const html=fs.readFileSync('public/index.html','utf8');
const current=css.slice(css.indexOf('/* RUDI v4.224'));
test('self card uses same one-row flex layout in both collapse states',()=>{
 assert.match(current,/:has\(#displayName\)\{\s*display:flex!important/);
 assert.match(current,/\.is-collapsed > \.rudi-collapse-body\{\s*display:none!important/);
 assert.match(current,/> \.rudi-home-self-line\{[\s\S]*?grid-template-rows:72px!important/);
 assert.doesNotMatch(current,/:has\(#displayName\)\.is-collapsed > \.rudi-home-self-line\{/);
});
test('name, photo and graph share the exact 72px row center',()=>{
 assert.match(current,/> \.rudi-home-self-line > \.profile-person-head\{[\s\S]*?height:72px!important/);
 assert.match(current,/> \.rudi-home-self-line > \.profile-energy-strip\{[\s\S]*?height:44px!important/);
 assert.match(current,/\.profile-person-head \.identity > \.person\{[\s\S]*?justify-content:center!important/);
 assert.match(current,/\.profile-person-head > \.identity\{[\s\S]*?align-items:center!important/);
});
test('mood sticker uses the new name-side layout and current asset version',()=>{
 assert.match(css,/\/\* RUDI v4\.226: native mood sticker BESIDE each name/);
 assert.match(html,/home-reference-layout\.css\?v=4\.226/);
 assert.doesNotMatch(css,/\/\* RUDI v4\.223 — unified compact SELF/);
});
