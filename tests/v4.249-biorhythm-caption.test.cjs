'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const js=fs.readFileSync('public/home-reference-layout.js','utf8');
const css=fs.readFileSync('public/home-reference-layout.css','utf8');
const html=fs.readFileSync('public/index.html','utf8');
const sw=fs.readFileSync('public/sw.js','utf8');
const block=js.slice(js.indexOf(' function updateEnergyPointCaption('),js.indexOf(' const energyPointObservers=',js.indexOf(' function updateEnergyPointCaption(')));
assert.ok(block.startsWith(' function updateEnergyPointCaption('),'caption updater found');

function mockEnergy(width=160,dotX=155){
 const phase={textContent:'Выдох'};
 const dot={getBoundingClientRect:()=>({left:100+dotX,width:8})};
 const markerLabel={textContent:'',style:{left:''},hidden:false,parentElement:null,
  getBoundingClientRect:()=>({width:44})};
 const energy={
  querySelector(selector){
   if(selector==='.profile-energy-label .profile-energy-phase')return phase;
   if(selector==='.profile-energy-plot .profile-energy-now')return dot;
   if(selector===':scope > .rudi-energy-point-caption')return markerLabel.parentElement===energy?markerLabel:null;
   return null;
  },
  appendChild(label){label.parentElement=energy},
  getBoundingClientRect:()=>({left:100,width})
 };
 const mockDocument={createElement(){return markerLabel}};
 const context={document:mockDocument};vm.runInNewContext(block+'\nthis.sync=updateEnergyPointCaption;',context);
 return {sync:()=>context.sync(energy),markerLabel,phase,dot,energy};
}
test('phase label is placed OUTSIDE the curve and follows the marker',()=>{
 const mock=mockEnergy(160,90);
 mock.sync();
 assert.equal(mock.markerLabel.parentElement,mock.energy);
 assert.equal(mock.markerLabel.textContent,'Выдох');
 assert.equal(mock.markerLabel.style.left,'94.0px');
 mock.phase.textContent='Пик';
 mock.sync();
 assert.equal(mock.markerLabel.textContent,'Пик');
});
test('caption is clamped inside narrow chart at both edges, without clipping the text',()=>{
 for(const [dotX,edge] of [[-2,'left'],[160,'right']]){
  const m=mockEnergy(120,dotX);m.sync();
  const x=Number.parseFloat(m.markerLabel.style.left);
  assert.ok(x>=25,edge+' escapes left');
  assert.ok(x<=95,edge+' escapes right');
 }
});
test('both partner cards are observed, including Rustam when Diana is logged in',()=>{
 assert.match(js,/for\(const id of \['homeRustamTile','homeDianaTile'\]\)\{\s*const strip=\$\(id\)\?\.querySelector\('\.profile-energy-strip'\)/);
 assert.match(js,/dotObserver\.observe\(current,\{attributes:true,attributeFilter:\['style'\]\}\)/);
 assert.match(js,/label\.parentElement!==energy\)energy\.appendChild\(label\)/);
 assert.match(js,/height':'54px'/);
});
test('energy title is hidden in both account roles; phase sits above, never on the curve',()=>{
 const tail=css.slice(css.indexOf('/* RUDI v4.249:'));
 assert.match(tail,/is\(#homeRustamTile,#homeDianaTile\) \.profile-energy-strip/);
 assert.match(tail,/\.profile-energy-label\{\s*display:none!important/);
 assert.match(tail,/grid-template-rows:14px 29px 11px!important/);
 assert.match(tail,/\.profile-energy-plot\{[\s\S]*?grid-row:2!important/);
 assert.match(tail,/\.profile-energy-times\{[\s\S]*?grid-row:3!important/);
 assert.match(tail,/> \.rudi-energy-point-caption\{[\s\S]*?top:0!important/);
 assert.match(tail,/max-width:calc\(100% - 6px\)!important/);
});
test('v4.249 cache busting is consistent for HTML and offline shell',()=>{
 for(const asset of ['home-reference-layout.css','home-reference-layout.js']){
  assert.match(html,new RegExp(asset.replace('.','\\.')+'\\?v=4\\.249'));
  assert.match(sw,new RegExp(asset.replace('.','\\.')+'\\?v=4\\.249'));
 }
 assert.match(sw,/rudi-shell-v4\.249/);
 assert.equal(fs.readFileSync('VERSION','utf8').trim(),'v4.249');
 assert.equal(JSON.parse(fs.readFileSync('rudi-version.json','utf8')).current,'v4.249');
});
