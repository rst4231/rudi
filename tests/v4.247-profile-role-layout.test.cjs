'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const js=fs.readFileSync('public/home-reference-layout.js','utf8');
const css=fs.readFileSync('public/home-reference-layout.css','utf8');
const html=fs.readFileSync('public/index.html','utf8');

function layout(actor,width){
 const start=js.indexOf('function layoutLiveSelf('),end=js.indexOf('// Relocate the same native mood buttons',start);
 assert.ok(start>=0&&end>start);
 const source=js.slice(start,end);
 const root={id:actor==='Рустам'?'homeRustamTile':'homeDianaTile',dataset:{},props:{}};
 const avatar={props:{}},person={props:{}};
 const identity={props:{},querySelector:q=>q==='.person'?person:null};
 const head={props:{},querySelector:q=>q==='.identity'?identity:q==='.score-avatar-wrap'?avatar:null};
 const energy={props:{}};
 const main={props:{}};
 const helpers={
  window:{innerWidth:width},
  setImportant(node,styles){Object.assign(node.props,styles)},
  alignLiveProfileAxis(){},
  ResizeObserver:undefined
 };
 const run=vm.runInNewContext('let selfAxisObserved=null,selfAxisObserver=null;\n'+source+
  '\nthis.layout=layoutLiveSelf;',helpers,{timeout:1000});
 helpers.layout(root,main,head,energy);
 return {root,main,head,energy,identity,avatar,person};
}
test('both logged-in profiles share EXACT same one-row layout at mobile widths',()=>{
 for(const width of [320,375,390,430,768]){
  const a=layout('Рустам',width),b=layout('Диана',width);
  for(const field of ['root','main','head','energy','identity','avatar','person']){
   assert.deepEqual({...a[field].props},{...b[field].props},
    field+' differs at width '+width);
  }
  assert.equal(a.main.props['grid-template-rows'],'72px');
  assert.equal(a.main.props['height'],'72px');
  assert.equal(a.energy.props['grid-column'],'2');
  assert.equal(a.energy.props['grid-row'],'1');
  assert.equal(a.head.props['grid-row'],'1');
  assert.equal(a.main.props['grid-template-columns'],
    width<=375?'minmax(0,53%) minmax(0,1fr)':'minmax(0,50%) minmax(0,1fr)');
 }
});
test('obsolete Diana-only stacked head / automatic 48px displacement is gone',()=>{
 assert.doesNotMatch(js,/function layoutLiveDiana\(/);
 assert.doesNotMatch(js,/'grid-template-rows':'48px 58px'/);
 assert.match(js,/function layoutLiveSelf\(self,main,profileHead,energy\)\{\s*\/\/[\s\S]*?return layoutLiveRustamV4229\(self,main,profileHead,energy\);/);
 assert.match(js,/function bindDianaShiftHours\(/,'Diana-specific working hours preserved');
 assert.match(js,/function placeMoodBadgesByName\(/,'both moods preserved');
 assert.match(js,/function bindEnergyDotExpander\(/,'expansion remains interactive');
});
test('partner roles share left/avatar/chart/contact/collapse rules',()=>{
 const d=css.slice(css.indexOf('/* Diana as PARTNER'),css.indexOf('/* RUDI v4.234: energy dot interactions'));
 const r=css.slice(css.indexOf('/* RUDI v4.247: role-symmetric partner cards'),css.indexOf('/* End RUDI v4.247 role-symmetric partner card.'));
 const dCount=(d.match(/#homeDianaTile:not\(:has\(#displayName\)\)/g)||[]).length;
 const rCount=(r.match(/#homeRustamTile:not\(:has\(#displayName\)\)/g)||[]).length;
 assert.ok(dCount>=30&&rCount>=dCount,'both partner sets must have all selectors');
 for(const needle of [
  'display:contents!important',
  'grid-template-columns:minmax(0,43%) minmax(0,1fr) auto!important',
  'grid-column:2!important',
  'grid-column:3!important',
  'width:44px!important;height:44px!important',
  'grid-template-rows:32px 12px!important',
  'position:static!important',
  'grid-row:2!important'
 ]){assert.ok(d.includes(needle),'Diana: '+needle);assert.ok(r.includes(needle),'Rustam: '+needle)}
 assert.match(r,/#homeRustamTile:not\(:has\(#displayName\)\) > \.rudi-collapse-body/);
 assert.match(css,/\.rudi-partner-fasting-outline/,'fasting halo untouched');
});
test('v4.247 serves new JS CSS from offline cache and preserves other modules',()=>{
 assert.match(html,/home-reference-layout\.js\?v=4\.247/);
 assert.match(html,/home-reference-layout\.css\?v=4\.247/);
 assert.match(html,/rudi-games-extra\.js\?v=4\.245/);
 const sw=fs.readFileSync('public/sw.js','utf8');
 assert.match(sw,/CACHE_NAME='rudi-shell-v4\.247'/);
 assert.match(sw,/home-reference-layout\.js\?v=4\.247/);
 assert.match(sw,/home-reference-layout\.css\?v=4\.247/);
 assert.equal(fs.readFileSync('VERSION','utf8').trim(),'v4.247');
 assert.equal(JSON.parse(fs.readFileSync('rudi-version.json','utf8')).current,'v4.247');
});