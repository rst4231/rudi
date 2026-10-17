const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const {createRudiStateClient}=require('../api/rudi-state-client.cjs');
const source=fs.readFileSync('api/partner-message.js','utf8');
const healthSource=source.slice(source.indexOf('function systemHealthRow('),source.indexOf('async function handler(req, res, options = {})'));
function fixture(env={},result={ok:true,storage:'cloudflare-d1'}){
 const calls=[];
 const client=createRudiStateClient({env,d1Client:{health:async()=>{calls.push('d1');return result}},vercelClient:{health:async()=>{calls.push('postgres');return {...result,storage:'vercel-postgres'}}}});
 const context={Date,Promise,process:{env:{}},globalThis:{fetch:()=>{throw Error('unexpected fetch')}},
  createRudiStateClient:options=>{assert.equal(options.env,env);return client},
  readAuthRecord:async()=>null,durableAuthOptions:()=>({}),
  getControlPlaneCache:()=>({get:async()=>null}),loadTickTickConfig:async()=>({enabled:false}),
  resolveTelegramBotToken:()=>'',getDailyCronState:async()=>null,readSummaryState:async()=>null};
 vm.runInNewContext(healthSource+';globalThis.buildSystemHealth=buildSystemHealth',context);
 return {calls,run:()=>context.globalThis.buildSystemHealth('Рустам',{env})};
}
test('system database check probes the default D1 primary and names the backend it checked',async()=>{
 const f=fixture(),payload=await f.run(),row=payload.checks.find(row=>row.id==='database');
 assert.equal(row.status,'ok');assert.equal(row.detail,'Cloudflare D1 отвечает');assert.deepEqual(f.calls,['d1']);
 assert.equal(row.label,'База данных');assert.ok(Number.isFinite(row.latencyMs));assert.equal(payload.ok,true);
});
test('explicit Postgres primary is probed and reported without claiming the D1 backend',async()=>{
 const f=fixture({RUDI_STORAGE_FORCE_VERCEL:'1'}),row=(await f.run()).checks.find(row=>row.id==='database');
 assert.equal(row.status,'ok');assert.equal(row.detail,'PostgreSQL отвечает');assert.deepEqual(f.calls,['postgres']);
});
test('an unsuccessful primary health response is an error instead of a healthy auth-record lookup',async()=>{
 const f=fixture({}, {ok:false,storage:'cloudflare-d1'}),row=(await f.run()).checks.find(row=>row.id==='database');
 assert.equal(row.status,'error');assert.equal(row.detail,'Cloudflare D1 недоступна');assert.deepEqual(f.calls,['d1']);
});
