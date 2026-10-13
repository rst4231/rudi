'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs');
const css=fs.readFileSync('public/home-reference-layout.css','utf8');
const js=fs.readFileSync('public/home-reference-layout.js','utf8');
const html=fs.readFileSync('public/index.html','utf8');
test('self card alone is narrower than car and layout remains single-column',()=>{
 assert.match(css,/has\(#displayName\)\{\s*width:92%!important/);
 assert.match(css,/\.rudi-home-self-line\{[\s\S]*?grid-template-columns:minmax\(0,1fr\)!important/);
 assert.match(css,/\.profile-energy-strip \.(?:profile-energy-plot)\{/);
});
test('hide only the arrow in own profile',()=>{
 assert.match(css,/\.profile-person-actions \.block-collapse-button\{\s*display:none!important/);
 assert.doesNotMatch(css,/\.profile-person-actions\{\s*display:none!important/);
});
test('biorhythm timeline uses full row and phase label at right, without energy word',()=>{
 assert.match(css,/\.profile-energy-label > span:first-child\{\s*display:none!important/);
 assert.match(css,/\.profile-energy-strip \.profile-energy-label\{[\s\S]*?right:0!important/);
 assert.match(css,/\.profile-energy-phase::before\{\s*content:none!important/);
});
test('outline tracks resize to actual buttons and avoid duplicate border',()=>{
 assert.match(js,/function roundedOutline\(width,height\)/);
 assert.match(js,/button\.getBoundingClientRect\(\)/);
 assert.match(js,/new ResizeObserver/);
 assert.match(js,/path\.setAttribute\('pathLength',path\.dataset\.rudiOriginalLength\)/);
 assert.match(css,/border-color:transparent!important/);
 assert.match(html,/home-reference-layout\.css\?v=4\.219/);
 assert.match(html,/home-reference-layout\.js\?v=4\.219/);
});
