'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const js=fs.readFileSync('public/home-reference-layout.js','utf8');
const css=fs.readFileSync('public/home-reference-layout.css','utf8');
const html=fs.readFileSync('public/index.html','utf8');
function simulate(tab){
 const events={};const tiles=[{hidden:false},{hidden:false}];
 const body={dataset:{appTab:tab}};
 const document={body,fonts:null,readyState:'loading',
   getElementById(){return null},
   addEventListener(n,fn){events['doc:'+n]=fn},
   querySelectorAll(s){return s==='[data-app-tab-section="home"]'?tiles:[]}};
 const window={addEventListener(n,fn){events['win:'+n]=fn}};
 vm.runInNewContext(js,{document,window,requestAnimationFrame(fn){fn();return 1},cancelAnimationFrame(){}},{timeout:1500});
 events['doc:DOMContentLoaded']?.();
 return {tiles,body,events};
}
test('Finance initial load hides any late home profile',()=>{
 const s=simulate('finances');assert.ok(s.tiles.every(t=>t.hidden));
});
test('Finance profile-ready event hides a newly inserted home card',()=>{
 const s=simulate('finances');const late={hidden:false};s.tiles.push(late);
 s.events['win:rudi:profile-ready']();assert.equal(late.hidden,true);
});
test('route transitions hide home cards outside Home',()=>{
 const s=simulate('home');assert.ok(s.tiles.every(t=>!t.hidden));
 s.body.dataset.appTab='finances';s.events['win:rudi:app-tab-change']({detail:{tab:'finances'}});
 assert.ok(s.tiles.every(t=>t.hidden));
});
test('route CSS and existing mood & dark rail remain in place',()=>{
 assert.match(css,/body:not\(\[data-app-tab="home"\]\) \[data-app-tab-section="home"\]\{\s*display:none!important/);
 assert.match(css,/\:has\(#displayName\)\[hidden\]\{\s*display:none!important/);
 assert.match(css,/html\[data-theme="light"\] body\[data-app-tab="home"\] \.rudi-home-shortcuts\{[\s\S]*?background:linear-gradient\(155deg,#1d2036/);
 assert.match(css,/\.profile-name-row > :is\(#moodCurrentButton,#partnerMoodValue\)\.avatar-mood-badge\{/);
 assert.match(css,/\.profile-name-row > #partnerMoodValue\[hidden\]/);
 assert.match(html,/home-reference-layout\.css\?v=4\.227/);
});
