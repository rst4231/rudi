const test=require('node:test');const assert=require('node:assert/strict');
const {setSectionSkip,getSectionSkip,setContentOverride,getContentOverride,appendFooter,applySectionControlToTelegramRequest}=require('../api/section-controls.cjs');
function cache(){const m=new Map();return{async get(k){return m.has(k)?structuredClone(m.get(k)):null},async set(k,v){m.set(k,structuredClone(v));return true},async delete(k){m.delete(k);return true}}}
test('date section skip persists independently',async()=>{const c=cache();await setSectionSkip('2026-08-30','facts',true,{cache:c});assert.equal(await getSectionSkip('2026-08-30','facts',{cache:c}),true);});
test('content override validates and persists parts',async()=>{const c=cache();await setContentOverride('2026-08-30','facts',['a','b'],{cache:c});assert.deepEqual((await getContentOverride('2026-08-30','facts',{cache:c})).parts,['a','b']);});
test('footer is appended only once',()=>{assert.equal(appendFooter('Текст','Футер'),'Текст\n\nФутер');assert.equal(appendFooter('Текст\n\nФутер','Футер'),'Текст\n\nФутер');});
test('disabled active section suppresses telegram publication',async()=>{const c=cache();const settings={sections:{facts:{enabled:false,topicId:72}}};const init={body:JSON.stringify({message_thread_id:72,text:'fact'})};const result=await applySectionControlToTelegramRequest('https://api.telegram.org/botx/sendMessage',init,{cache:c,date:'2026-09-11',settings});assert.equal(result.handled,true);const payload=await result.response.json();assert.equal(payload.result.suppressed_by_config,true);});

test('publishToTelegram false suppresses topic post while section stays enabled',async()=>{
  const c=cache();
  const settings={sections:{facts:{enabled:true,topicId:72,publishToTelegram:false}}};
  const init={body:JSON.stringify({message_thread_id:72,text:'fact'})};
  const result=await applySectionControlToTelegramRequest('https://api.telegram.org/botx/sendMessage',init,{cache:c,date:'2026-09-21',settings});
  assert.equal(result.handled,true);
  const payload=await result.response.json();
  assert.equal(payload.result.suppressed_by_publish_setting,true);
});
