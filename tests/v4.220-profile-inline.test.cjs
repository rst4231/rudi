'use strict';
const test=require('node:test'), assert=require('node:assert/strict'), fs=require('node:fs');
const css=fs.readFileSync('public/home-reference-layout.css','utf8');
const js=fs.readFileSync('public/home-reference-layout.js','utf8');
const latest=css.slice(css.indexOf('/* RUDI v4.220:'));
test('same outer width as car, compact height, avatar and graph in one row',()=>{
 assert.match(latest,/has\(#displayName\)\{\s*width:100%!important;\s*max-width:100%!important/);
 assert.match(latest,/padding:8px 11px!important/);
 assert.match(latest,/grid-template-columns:minmax\(0,43%\) minmax\(0,1fr\)!important/);
 assert.match(latest,/\.rudi-home-self-line > \.profile-energy-strip\{[\s\S]*?grid-column:2!important/);
});
test('phase label moves with timeline now marker',()=>{
 assert.match(js,/function updateEnergyPointCaption\(energy\)/);
 assert.match(js,/querySelector\('\.profile-energy-plot \.profile-energy-now'\)/);
 assert.match(js,/querySelector\('\.profile-energy-label \.profile-energy-phase'\)/);
 assert.match(js,/new MutationObserver\(\(\)=>updateEnergyPointCaption\(energy\)\)/);
 assert.match(latest,/\.profile-energy-plot \.rudi-energy-point-caption\{/);
 assert.match(latest,/bottom:calc\(100% \+ 4px\)!important/);
 assert.match(latest,/\.profile-energy-strip \.profile-energy-label\{\s*display:none!important/);
});
test('both progress outlines match finance halo at three pixels',()=>{
 assert.match(js,/const inset=1\.5,r=Math\.max\(1,Math\.min\(12\.5/);
 assert.match(latest,/stroke-width:3px!important/);
 assert.match(latest,/vector-effect:non-scaling-stroke!important/);
});
