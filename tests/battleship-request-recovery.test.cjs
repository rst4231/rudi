const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const source=fs.readFileSync('public/rudi-games-extra.js','utf8');
function fixture(fetch){
 const timers=new Map();let next=0;
 const ctx={fetch,AbortController,window:{},setTimeout(fn,ms){timers.set(++next,{fn,ms});return next},clearTimeout(id){timers.delete(id)}};
 vm.createContext(ctx);vm.runInContext(source.slice(source.indexOf('async function battleRequest('),source.indexOf('function leaveBattle(')),ctx);
 return {request:ctx.battleRequest,timers};
}
const tick=()=>new Promise(resolve=>setImmediate(resolve));
for(const phase of ['fetch','body'])test(`a stalled ${phase} is bounded even if the transport ignores abort`,async()=>{
 let signal;const f=fixture(async(url,options)=>{signal=options.signal;if(phase==='fetch')return new Promise(()=>{});return {ok:true,json:()=>new Promise(()=>{})}});
 let outcome='pending';const p=f.request('move',{index:3,version:1}).then(()=>outcome='ok',e=>outcome=e.name);
 await tick();for(const timer of [...f.timers.values()])timer.fn();await tick();
 assert.equal(outcome,'AbortError','shot cannot hold the board forever');assert.equal(signal.aborted,true);await p;
 assert.equal(f.timers.size,0);
});
test('external cancellation aborts the shot and discards even a late successful response',async()=>{
 let finish;const f=fixture(()=>new Promise(resolve=>finish=resolve));const controller=new AbortController();
 let outcome='pending';const p=f.request('move',{},controller.signal).then(()=>outcome='ok',e=>outcome=e.name);
 controller.abort();await tick();assert.equal(outcome,'AbortError');
 finish({ok:true,json:async()=>({ok:true,room:{version:99}})});await p;assert.equal(outcome,'AbortError');
});
test('successful requests clear the deadline and return the authoritative room',async()=>{
 const f=fixture(async()=>({ok:true,json:async()=>({ok:true,room:{version:2}})}));
 assert.equal((await f.request('move')).version,2);assert.equal(f.timers.size,0);
});
