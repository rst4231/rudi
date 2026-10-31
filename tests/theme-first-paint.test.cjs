'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const html=fs.readFileSync('public/index.html','utf8');
const bootstrap=html.match(/<script>\s*([\s\S]*?)<\/script>/)[1];
function boot(mode,systemDark=false){
 const events={},root={dataset:{},style:{}},meta={setAttribute(_k,v){this.content=v}},values=new Map([['rudi:theme-paint:v1',JSON.stringify({mode,theme:mode==='system'?'dark':mode})]]);
 const ctx={window:{matchMedia:()=>({matches:systemDark}),addEventListener:(k,fn)=>{events[k]=fn}},document:{documentElement:root,querySelector:()=>meta,addEventListener:(k,fn)=>{events[k]=fn}},localStorage:{getItem:k=>values.get(k)||null,setItem:(k,v)=>values.set(k,v)}};
 vm.runInNewContext(bootstrap,ctx);return {root,meta,events};
}
test('explicit dark mode paints dark before application scripts even on a light device',()=>{
 const h=boot('dark');assert.equal(h.root.dataset.theme,'dark');assert.equal(h.root.style.backgroundColor,'#0b0d12');assert.equal(h.meta.content,'#0b0d12');
});
test('explicit light mode and automatic mode keep their intended first paint',()=>{
 assert.equal(boot('light',true).root.dataset.theme,'light');assert.equal(boot('system',false).root.dataset.theme,'light');assert.equal(boot('system',true).root.dataset.theme,'dark');
});
test('returning to the app restores the currently selected canvas colour synchronously',()=>{
 const h=boot('dark');h.root.style.backgroundColor='';assert.equal(typeof h.events.pageshow,'function');h.events.pageshow();assert.equal(h.root.style.backgroundColor,'#0b0d12');
 h.root.dataset.theme='light';h.events.visibilitychange();assert.equal(h.root.style.backgroundColor,'#f4f5f7');
});
test('authentication startup preserves the selected theme until the actor is restored',()=>{
 const src=fs.readFileSync('public/app.js','utf8'),start=src.indexOf('      function currentThemeMode(){'),end=src.indexOf('      function marketTickerEnabled()',start);
 for(const mode of ['dark','light','system']){
 const ctx={currentActor:'',localStorage:{getItem:()=>JSON.stringify({mode})}};
 assert.equal(vm.runInNewContext(src.slice(start,end)+';currentThemeMode()',ctx),mode);
 }
});
