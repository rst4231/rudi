'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const js=fs.readFileSync('public/home-reference-layout.js','utf8');
const css=fs.readFileSync('public/home-reference-layout.css','utf8');
function tile(id,initiallyHidden=false){
 const styles=new Map([['display',{value:'flex',priority:'important'}]]);
 return {id,hidden:initiallyHidden,dataset:{},
  style:{getPropertyValue:p=>styles.get(p)?.value||'',getPropertyPriority:p=>styles.get(p)?.priority||'',
   setProperty:(p,value,priority='')=>styles.set(p,{value,priority}),removeProperty:p=>styles.delete(p)}};
}
function simulate(tab){
 const profile=tile('homeRustamTile'),shortcuts=tile('rudiHomeShortcuts',true),tiles=[profile,shortcuts],events={};
 const body={dataset:{appTab:tab}};
 const doc={body,fonts:null,readyState:'loading',getElementById:()=>null,querySelector:()=>null,
  querySelectorAll:s=>s==='[data-app-tab-section="home"]'?tiles:[],
  addEventListener:(name,fn)=>events['doc:'+name]=fn};
 const win={addEventListener:(name,fn)=>events['win:'+name]=fn};
 vm.runInNewContext(js,{document:doc,window:win,requestAnimationFrame:fn=>{fn();return 1},cancelAnimationFrame(){}},{timeout:1500});
 events['doc:DOMContentLoaded']();
 return {profile,shortcuts,navigate(t){body.dataset.appTab=t;events['win:rudi:app-tab-change']();}};
}
test('Calendar, Finance and other tabs override inline-important profile display',()=>{
 for(const tab of ['finances','schedule','products']){
  const s=simulate(tab);
  assert.equal(s.profile.hidden,true);
  assert.equal(s.profile.style.getPropertyValue('display'),'none');
  assert.equal(s.profile.style.getPropertyPriority('display'),'important');
 }
});
test('Home navigation restores profile display and keeps previously hidden controls hidden',()=>{
 const s=simulate('home');
 s.navigate('finances');s.navigate('schedule');s.navigate('home');
 assert.equal(s.profile.style.getPropertyValue('display'),'flex');
 assert.equal(s.profile.style.getPropertyPriority('display'),'important');
 assert.equal(s.profile.hidden,false);
 assert.equal(s.shortcuts.hidden,false);
});
test('CSS fallback and route observers remain active',()=>{
 assert.match(js,/attributeFilter:\['data-app-tab'\]/);
 assert.match(js,/change\.addedNodes/);
 assert.match(css,/body\[data-app-tab\]:not\(\[data-app-tab="home"\]\)/);
});
