'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const css=fs.readFileSync('public/home-reference-layout.css','utf8');
const js=fs.readFileSync('public/home-reference-layout.js','utf8');
const html=fs.readFileSync('public/index.html','utf8');
test('Rustam keeps exact v4.229 inline layout settings',()=>{
 const source=js.slice(js.indexOf('function layoutLiveRustamV4229('),js.indexOf(' // Relocate the same native mood buttons'));
 assert.ok(source.includes("'min-height':'82px','padding-top':'6px','padding-bottom':'3px'"));
 assert.ok(source.includes("'grid-template-rows':'72px','grid-auto-rows':'72px'"));
 assert.ok(source.includes("'height':'72px','min-height':'72px','max-height':'72px'"));
 assert.ok(source.includes("'grid-column':'2','grid-row':'1','align-self':'center','height':'44px'"));
 assert.ok(source.includes("'grid-template-columns':narrow?'minmax(0,53%) minmax(0,1fr)':'minmax(0,50%) minmax(0,1fr)'"));
});
test('expanded graph is called only for Diana',()=>{
 assert.match(js,/if\(self\.id==='homeDianaTile'\)return layoutLiveDiana\(/);
 const diana=js.slice(js.indexOf('function layoutLiveDiana('),js.indexOf('function layoutLiveRustamV4229('));
 assert.match(diana,/'grid-template-rows':'48px 58px'/);
 assert.match(diana,/'grid-column':'1','grid-row':'2','align-self':'center','height':'58px'/);
});
test('new width and chart styles contain only Diana-specific selectors',()=>{
 const patch=css.slice(css.indexOf('/* RUDI v4.232:'));
 assert.ok(patch);
 assert.doesNotMatch(patch,/#homeRustamTile/);
 assert.match(patch,/#homeDianaTile:has\(#displayName\)/);
 assert.match(patch,/width:100%!important/);
 assert.match(patch,/max-width:100%!important/);
 assert.match(patch,/margin-left:0!important/);
 assert.match(patch,/justify-self:stretch!important/);
 assert.match(patch,/#homeDianaTile \.profile-energy-plot \.rudi-energy-point-caption/);
 assert.match(css,/body\[data-app-tab="home"\] :is\(#homeRustamTile,#homeDianaTile\):has\(#displayName\)/);
});
test('PWA version bump does not change game assets',()=>{
 assert.match(html,/home-reference-layout\.js\?v=4\.231/);
 assert.match(html,/home-reference-layout\.css\?v=4\.233/);
 assert.match(html,/rudi-games\.js\?v=4\.230/);
 assert.match(html,/rudi-games\.css\?v=4\.230/);
 assert.match(fs.readFileSync('public/sw.js','utf8'),/rudi-shell-v4\.233/);
});
