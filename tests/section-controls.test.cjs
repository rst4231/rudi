const test=require('node:test');const assert=require('node:assert/strict');
const {setSectionSkip,getSectionSkip,setContentOverride,getContentOverride,appendFooter}=require('../api/section-controls.cjs');
function cache(){const m=new Map();return{async get(k){return m.has(k)?structuredClone(m.get(k)):null},async set(k,v){m.set(k,structuredClone(v));return true},async delete(k){m.delete(k);return true}}}
test('date section skip persists independently',async()=>{const c=cache();await setSectionSkip('2026-08-30','facts',true,{cache:c});assert.equal(await getSectionSkip('2026-08-30','facts',{cache:c}),true);});
test('content override validates and persists parts',async()=>{const c=cache();await setContentOverride('2026-08-30','recipes',['a','b'],{cache:c});assert.deepEqual((await getContentOverride('2026-08-30','recipes',{cache:c})).parts,['a','b']);});
test('footer is appended only once',()=>{assert.equal(appendFooter('Текст','Футер'),'Текст\n\nФутер');assert.equal(appendFooter('Текст\n\nФутер','Футер'),'Текст\n\nФутер');});
