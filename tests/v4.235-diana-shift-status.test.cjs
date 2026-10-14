'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const js=fs.readFileSync('public/home-reference-layout.js','utf8');
const html=fs.readFileSync('public/index.html','utf8');
const start=js.indexOf('function dianaStatusWithoutVerb(');
const end=js.indexOf(' function arrange(){',start);
assert.ok(start>0&&end>start);
const fragment=js.slice(start,end);
test('Diana work status only shows actual shift hours',()=>{
 const context={};
 vm.runInNewContext(fragment+'\nthis.format=dianaStatusWithoutVerb;',context);
 assert.equal(context.format('Работаю · 09:00–18:00'),'09:00–18:00');
 assert.equal(context.format('Работаю · 10:15–21:30'),'10:15–21:30');
 assert.equal(context.format('Работаю'),'');
 assert.equal(context.format('Отдыхаю'),'Отдыхаю');
 assert.equal(context.format('Проверяю график…'),'Проверяю график…');
});
test('scheduled status updates stay synchronized, without extra observers',()=>{
 const listeners=[],node={dataset:{},textContent:'Работаю · 08:00–17:00',hidden:false};
 const diana={querySelector:selector=>selector==='.profile-work-status'?node:null};
 class Observer{constructor(cb){this.cb=cb;listeners.push(this)}observe(node,options){this.target=node;this.options=options}}
 const context={document:{getElementById:id=>id==='homeDianaTile'?diana:null},MutationObserver:Observer};
 vm.runInNewContext('const $=id=>document.getElementById(id);\n'+fragment+'\nthis.bind=bindDianaShiftHours;',context);
 context.bind();context.bind();
 assert.equal(node.textContent,'08:00–17:00');assert.equal(listeners.length,1);
 node.textContent='Работаю · 12:00–22:00';listeners[0].cb();
 assert.equal(node.textContent,'12:00–22:00');
 node.textContent='Отдыхаю';listeners[0].cb();
 assert.equal(node.textContent,'Отдыхаю');
 node.textContent='Работаю';listeners[0].cb();
 assert.equal(node.textContent,'');assert.equal(node.hidden,true);
});
test('only Diana node is targeted; Rustam and existing Home behaviors untouched',()=>{
 assert.match(fragment,/\$\('homeDianaTile'\)\?\.querySelector\('\.profile-work-status'\)/);
 assert.doesNotMatch(fragment,/#homeRustamTile|homeRustamTile|selfWorkStatus/);
 assert.match(js,/placeMoodBadgesByName\(\);\s*bindDianaShiftHours\(\)/);
 assert.match(html,/home-reference-layout\.js\?v=4\.\d+/);
 assert.match(fs.readFileSync('public/sw.js','utf8'),/rudi-shell-v4\.\d+/);
});
