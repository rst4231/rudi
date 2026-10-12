'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs');
const source=fs.readFileSync('public/pwa-extras.js','utf8');
const html=fs.readFileSync('public/index.html','utf8');
const backend=fs.readFileSync('api/partner-message.js','utf8');
function mountFixture(){
 const start=source.indexOf('  function installHealthSettings(){');
 const end=source.indexOf('\n  function installNativeInteractionPolish(){',start);
 assert.ok(start>0&&end>start,'health owner installer found');
 const text=source.slice(start,end);
 let current=null,created=0,clicks=0;
 const button={addEventListener(type){if(type==='click')clicks++;}};
 const panel={
   querySelectorAll:()=>[],
   insertBefore(group){current=group;}
 };
 const byId=id=>id==='homeSettingsPanel'?panel:id==='rudiHealthSettings'?current:id==='rudiHealthRun'?button:null;
 const document={
   body:{dataset:{rudiActor:''}},
   createElement:tag=>{
     assert.equal(tag,'section');
     created++;
     return {
       id:'',className:'',innerHTML:'',
       remove(){current=null;}
     };
   }
 };
 const installer=new Function('byId','document','runHealthCheck',
   text+'\nreturn installHealthSettings;')(byId,document,()=>{});
 return {installer,document,active:()=>current,created:()=>created,clicks:()=>clicks};
}
test('unknown and Diana accounts never receive health diagnostics card',()=>{
 const f=mountFixture();
 assert.equal(f.installer(),false);
 assert.equal(f.active(),null);
 f.document.body.dataset.rudiActor='Диана';
 assert.equal(f.installer(),false);
 assert.equal(f.active(),null);
 assert.equal(f.created(),0);
});
test('Rustam sees the health block once; switching to Diana instantly removes it, switching back restores it',()=>{
 const f=mountFixture();
 f.document.body.dataset.rudiActor='Рустам';
 assert.equal(f.installer(),true);
 assert.equal(f.active()?.id,'rudiHealthSettings');
 assert.equal(f.installer(),false);
 assert.equal(f.created(),1);
 f.document.body.dataset.rudiActor='Диана';
 assert.equal(f.installer(),false);
 assert.equal(f.active(),null);
 f.document.body.dataset.rudiActor='Рустам';
 assert.equal(f.installer(),true);
 assert.equal(f.created(),2);
 assert.equal(f.clicks(),2);
});
test('actor mutation observer reapplies hide, health fetch & result also check Rustam; server rejects partner',()=>{
 assert.match(source,/observer\.observe\(document\.body,\{childList:true,subtree:true,attributes:true,attributeFilter:\['data-rudi-actor'\]\}\)/);
 assert.match(source,/async function runHealthCheck\(\)\{\s*\/\/[^\n]*\n\s*if\(String\(document\.body\?\.dataset\?\.rudiActor\|\|''\)!=='Рустам'\) return;/);
 assert.match(source,/function renderHealthCheck\(payload\)\{\s*if\(String\(document\.body\?\.dataset\?\.rudiActor\|\|''\)!=='Рустам'\) return;/);
 assert.match(backend,/if\(actor!=='Рустам'\) throw new Error\('rudi-health-owner-only'\)/);
 assert.match(backend,/code==='rudi-health-owner-only'\?403/);
});
test('new settings Javascript is cache-busted without changing other script versions',()=>{
 assert.match(html,/src="\/pwa-extras\.js\?v=4\.181"/);
 assert.equal(fs.readFileSync('VERSION','utf8').trim(),'v4.181');
});
