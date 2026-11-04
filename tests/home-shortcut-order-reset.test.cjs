'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),{JSDOM}=require('jsdom');
const layout=fs.readFileSync('public/home-reference-layout.js','utf8'),app=fs.readFileSync('public/app.js','utf8');
function appFunction(name){const start=app.indexOf('      function '+name+'(');assert.ok(start>=0);const end=app.indexOf('\n      function ',start+1);return app.slice(start,end);}
function setup(){
 const dom=new JSDOM('<body data-app-tab="home"><main class="shell"><div id="homeTileHost"><section id="homeRustamTile" data-home-tile="rustam"><b id="displayName">Рустам</b><div class="mood-self-buttons"><button id="fastingProfileButton"></button></div></section><section id="homeDashboard" data-home-tile="dashboard"></section><section id="other" data-home-tile="other"></section></div></main></body>',{runScripts:'outside-only',url:'https://rudi.test/'}),w=dom.window;
 w.requestAnimationFrame=cb=>{cb();return 1};w.MutationObserver=undefined;w.ResizeObserver=undefined;w.setInterval=()=>0;
 w.eval(layout.replace(" if(document.readyState==='loading')", " window.testArrange=arrange;\n if(document.readyState==='loading')"));w.testArrange();
 w.eval("const ensureHomeTileHost=()=>document.getElementById('homeTileHost');const normalizedHomeOrder=x=>x;const preferredHomeDefaultOrder=()=>['dashboard','rustam','other'];const homeTileRects=()=>null;const animateHomeReorder=()=>{};const saveHomeOrder=()=>{};const tg=null;\n"+['applyHomeOrder','updateHomeOrderControls','resetHomeOrder','moveHomeTile'].map(appFunction).join('\n')+'\nwindow.testLayout={applyHomeOrder,resetHomeOrder,moveHomeTile};');
 return{dom,w,doc:w.document};
}
test('reset restores greeting above shortcuts and keeps the seven original controls',()=>{
 const f=setup();try{const original=f.doc.getElementById('fastingProfileButton');f.w.testLayout.resetHomeOrder();const host=f.doc.getElementById('homeTileHost');assert.equal(host.firstElementChild.id,'homeDashboard');assert.equal(f.doc.getElementById('homeDashboard').nextElementSibling.id,'rudiHomeShortcuts');assert.equal(f.doc.getElementById('fastingProfileButton'),original);}finally{f.dom.window.close()}
});
test('tile movement skips the shortcut rail instead of treating it as a blocked sibling',()=>{
 const f=setup();try{f.w.testLayout.resetHomeOrder();f.w.testArrange();const self=f.doc.getElementById('homeRustamTile');f.w.testLayout.moveHomeTile(self,'up');const tiles=[...f.doc.querySelectorAll('#homeTileHost > [data-home-tile]')].map(n=>n.dataset.homeTile);assert.deepEqual(tiles,['rustam','dashboard','other']);f.w.testLayout.resetHomeOrder();assert.equal(f.doc.getElementById('homeTileHost').firstElementChild.id,'homeDashboard');}finally{f.dom.window.close()}
});
