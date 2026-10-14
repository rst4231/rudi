'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const css=fs.readFileSync('public/home-reference-layout.css','utf8');
const js=fs.readFileSync('public/home-reference-layout.js','utf8');
const html=fs.readFileSync('public/index.html','utf8');
const d=css.slice(css.indexOf('/* RUDI v4.234: Diana partner alignment'),css.indexOf('/* RUDI v4.234: energy dot interactions'));
test('partner Diana matches Rustam left inset, avatar, name gap, and vertical center',()=>{
 assert.match(d,/grid-template-rows:72px auto!important/);
 assert.match(d,/padding:6px 11px 3px!important/);
 assert.match(d,/grid-template-columns:44px minmax\(0,1fr\)!important/);
 assert.match(d,/gap:8px!important/);
 assert.match(d,/width:44px!important;height:44px!important/);
 assert.match(d,/align-self:center!important;justify-content:center!important/);
 assert.match(d,/grid-template-rows:32px 12px!important/);
 assert.match(d,/height:44px!important;min-height:44px!important/);
 assert.match(d,/padding-inline:9px!important/);
 assert.doesNotMatch(d,/#homeRustamTile/);
});
test('both biorhythm points glow, can be tapped, and keep original chart geometry',()=>{
 const glow=css.slice(css.indexOf('/* RUDI v4.234: energy dot interactions'));
 assert.match(glow,/:is\(#homeRustamTile,#homeDianaTile\) \.profile-energy-plot \.profile-energy-now/);
 assert.match(glow,/box-shadow:0 0 0 2px/);
 assert.match(glow,/::before\{[\s\S]*?inset:-18px/);
 assert.match(glow,/pointer-events:auto!important/);
 assert.match(html,/home-reference-layout\.js\?v=4\.234/);
 assert.match(html,/home-reference-layout\.css\?v=4\.234/);
});
test('tap or Enter expands only the corresponding collapsed profile, no duplicate bindings',()=>{
 const start=js.indexOf('function bindEnergyDotExpander(');
 const end=js.indexOf(' function layoutLiveSelf(',start);
 assert.ok(start>0&&end>start);
 const callbacks={},attrs={},handlers={};let opens=0;
 const tile={id:'homeRustamTile',collapsed:true,
   classList:{contains:key=>key==='is-collapsed'&&tile.collapsed},
   querySelector:key=>key==='.block-collapse-button'?{click:()=>{opens++;tile.collapsed=false}}:null};
 const dot={dataset:{},removeAttribute:()=>{},setAttribute:(k,v)=>attrs[k]=v,addEventListener:(k,f)=>handlers[k]=f};
 const energy={closest:()=>tile,querySelector:()=>dot,setAttribute:()=>{}};
 const bind=vm.runInNewContext('('+js.slice(start,end).trim()+')',{document:{body:{dataset:{appTab:'home'}}},MutationObserver:class{constructor(cb){callbacks.change=cb}observe(){}}});
 bind(energy);bind(energy);
 const e={preventDefault(){},stopPropagation(){}};
 handlers.click(e);handlers.click(e);
 assert.equal(opens,1);
 assert.equal(attrs['aria-expanded'],'true');
 tile.collapsed=true;
 handlers.keydown({...e,key:'Enter'});
 assert.equal(opens,2);
});
test('nearest button routes through the native Feed tab, not Schedule',()=>{
 const section=js.slice(js.indexOf('// The Home “Ближайшее”'),js.indexOf(" if(document.readyState==='loading')"));
 assert.match(section,/event\.target\?\.closest\?\.\('#homeNearestOpen'\)/);
 assert.match(section,/\.app-tab-button\[data-app-tab="feed"\]/);
 assert.match(section,/event\.stopImmediatePropagation\(\)/);
 assert.match(section,/feed\.click\(\)/);
 assert.doesNotMatch(section,/navigateToAppTab\('schedule'/);
});
