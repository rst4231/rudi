const test=require('node:test'),assert=require('node:assert/strict');
const {readLuluHealth,saveLuluHealth}=require('../api/lulu-store.cjs');
function cache(){const map=new Map();return {get:async k=>map.get(k),set:async(k,v)=>{map.set(k,structuredClone(v))}}}
test('shared current health text survives a month change and can be cleared',async()=>{
 const c=cache(),o={luluCache:c,now:Date.parse('2026-10-30T12:00:00Z')};
 const saved=await saveLuluHealth('Диана',{text:'Чешет ухо\nПроблемы с лапой',expectedUpdatedAt:''},o);
 const read=await readLuluHealth({...o,now:Date.parse('2026-11-02T12:00:00Z')});assert.equal(read.text,saved.text);assert.equal(read.actor,'Диана');
 const cleared=await saveLuluHealth('Рустам',{text:'',expectedUpdatedAt:read.updatedAt},{...o,now:Date.parse('2026-11-02T12:01:00Z')});assert.equal(cleared.text,'');
});
test('health rejects stale edits and invalid input without overwriting current text',async()=>{
 const c=cache(),o={luluCache:c};await saveLuluHealth('Диана',{text:'Ухо',expectedUpdatedAt:''},o);
 await assert.rejects(saveLuluHealth('Рустам',{text:'Лапа',expectedUpdatedAt:''},o),/lulu-health-conflict/);
 await assert.rejects(saveLuluHealth('Рустам',{text:'x'.repeat(2001)},o),/lulu-health-invalid/);
 assert.equal((await readLuluHealth(o)).text,'Ухо');
});
