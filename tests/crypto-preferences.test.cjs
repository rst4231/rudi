const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
function subject(){const file=path.join(__dirname,'../api/crypto-preferences.cjs');assert.ok(fs.existsSync(file),'crypto preferences module must exist');return require(file)}
function client(){const rows=new Map();return {getRecord:async(ns,key)=>rows.get(ns+key),setRecord:async r=>rows.set(r.namespace+r.key,r)}}
test('Moscow weekend starts Friday at 21:00 UTC and ends Sunday at 21:00 UTC',()=>{const {status}=subject();assert.equal(status({},Date.parse('2026-11-13T20:59:59Z')).automaticAllowed,true);assert.equal(status({},Date.parse('2026-11-13T21:00:00Z')).automaticAllowed,false);assert.equal(status({},Date.parse('2026-11-15T20:59:59Z')).automaticAllowed,false);assert.equal(status({},Date.parse('2026-11-15T21:00:00Z')).automaticAllowed,true)});
test('manual pause also stops a weekday',()=>{assert.equal(subject().status({enabled:false},Date.parse('2026-11-16T12:00:00Z')).automaticAllowed,false)});
test('D1 null and absent preferences use enabled defaults without breaking wallet loading',async()=>{const p=subject();for(const value of [null,undefined]){const s=await p.read({client:{getRecord:async()=>({value})},now:Date.parse('2026-11-15T08:00:00Z')});assert.equal(s.enabled,true);assert.equal(s.automaticAllowed,false);assert.equal(s.reason,'weekend')}assert.equal(p.status(null,Date.parse('2026-11-16T08:00:00Z')).automaticAllowed,true)});
test('settings persist and only owner may change them',async()=>{const p=subject(),c=client();await p.update('Рустам',{enabled:false},{client:c});assert.equal((await p.read({client:c})).enabled,false);await assert.rejects(p.update('Диана',{enabled:true},{client:c}),/crypto-owner-only/);await assert.rejects(p.update('Рустам',{enabled:'false'},{client:c}),/crypto-input-invalid/)});
