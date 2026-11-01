const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const {JSDOM}=require('jsdom');
const source=fs.readFileSync('public/lulu-care.js','utf8');
const weight={kind:'weight',id:'w1',data:{date:'2026-10-30',kg:12.5},updatedAt:'2026-10-30T12:00:00Z'};
async function setup(offline,request){
 const dom=new JSDOM('<div id="care"></div>',{runScripts:'outside-only'}),w=dom.window;
 w.structuredClone=structuredClone;w.rudiOfflineContent=offline;w.eval(source);
 const root=w.document.querySelector('#care'),dispose=w.RudiLuluCare.mount(root,{actor:'Рустам',request});
 return {root,close(){dispose();w.close()}};
}
const settle=()=>new Promise(r=>setTimeout(r,25));
test('weight is not reported absent while loading',async()=>{
 const h=await setup(null,()=>new Promise(()=>{}));
 try{assert.equal(h.root.querySelector('.lulu-care-value').textContent,'Загружаю вес…')}finally{h.close()}
});
test('cache failure does not block loading the latest weight from server',async()=>{
 const h=await setup({cached:async()=>{throw Error('disk unavailable')}},async()=>({care:{records:[weight],revisions:{}}}));
 try{await settle();assert.equal(h.root.querySelector('.lulu-care-value').textContent,'12,5 кг')}finally{h.close()}
});
test('cached latest weight and date remain visible without network',async()=>{
 const h=await setup({cached:async()=>({records:[weight],revisions:{}})},async()=>{throw TypeError('offline')});
 try{await settle();assert.equal(h.root.querySelector('.lulu-care-value').textContent,'12,5 кг');assert.match(h.root.textContent,/30 окт/)}finally{h.close()}
});
