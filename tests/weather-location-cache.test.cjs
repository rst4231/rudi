const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const source=fs.readFileSync('public/weather.js','utf8');
function fixture({storage=new Map(),blocked=false,permission='granted',unsupported=false}={}){
 let now=Date.UTC(2026,10,11,9),calls=0,denied=false,coords={latitude:60.0479,longitude:30.452};
 const localStorage={getItem(key){if(blocked)throw Error('blocked');return storage.get(key)||null},setItem(key,value){if(blocked)throw Error('blocked');storage.set(key,value)}};
 function open(){
  const navigator={geolocation:{getCurrentPosition(resolve,reject){calls++;if(denied)return reject(Error('denied'));resolve({coords})}}};
  if(!unsupported)navigator.permissions={query:async()=>({state:permission})};
  const context={window:{},Date:class extends Date{static now(){return now}},localStorage,navigator};
  vm.runInNewContext(source,context);return context.window.RUDI_WEATHER;
 }
 return {storage,open,advance(ms){now+=ms},deny(){denied=true},setPermission(value){permission=value},move(){coords={latitude:55.7558,longitude:37.6173}},get calls(){return calls}};
}
test('granted access refreshes a changed city after five minutes and across reloads',async()=>{
 const f=fixture(),weather=f.open();assert.equal((await weather.getAutomaticLocation()).city,'murino');
 f.advance(4*60000);assert.equal((await f.open().getAutomaticLocation()).city,'murino');assert.equal(f.calls,1);
 f.move();f.advance(60000);assert.equal((await weather.getAutomaticLocation()).city,'moscow');assert.equal(f.calls,2);
});
test('expired permission reuses the last city across launches without another permission popup',async()=>{
 const f=fixture();await f.open().getAutomaticLocation();f.setPermission('prompt');f.advance(7*24*3600000);
 const result=await f.open().getAutomaticLocation();assert.equal(result.city,'murino');assert.equal(result.needsPermission,true);assert.equal(f.calls,1);
});
for(const permission of ['prompt','denied'])test(permission+' does not trigger geolocation on startup without a saved city',async()=>{
 const f=fixture({permission});const value=await f.open().getAutomaticLocation();assert.equal(value.resolved,false);assert.equal(value.needsPermission,true);assert.equal(f.calls,0);
});
test('unsupported Permissions API uses saved city and only an explicit request asks for access',async()=>{
 const f=fixture({unsupported:true}),weather=f.open();assert.equal((await weather.getAutomaticLocation()).resolved,false);assert.equal(f.calls,0);
 assert.equal((await weather.getAutomaticLocation({requestPermission:true})).city,'murino');assert.equal(f.calls,1);
 f.advance(6*60000);assert.equal((await f.open().getAutomaticLocation()).city,'murino');assert.equal(f.calls,1);
});
test('explicit request allows first consent and subsequent granted requests are automatic',async()=>{
 const f=fixture({permission:'prompt'}),weather=f.open();assert.equal((await weather.getAutomaticLocation({requestPermission:true})).city,'murino');
 f.setPermission('granted');f.move();f.advance(6*60000);assert.equal((await weather.getAutomaticLocation()).city,'moscow');assert.equal(f.calls,2);
});
test('an outage keeps the last city rather than overwriting it with Petersburg',async()=>{
 const f=fixture(),weather=f.open();await weather.getAutomaticLocation();f.deny();f.advance(6*60000);
 assert.equal((await weather.getAutomaticLocation()).city,'murino');await weather.getAutomaticLocation();assert.equal(f.calls,2);
 f.setPermission('prompt');assert.equal((await f.open().getAutomaticLocation()).city,'murino');
});
test('concurrent weather consumers share one location request',async()=>{
 const f=fixture(),weather=f.open();const values=await Promise.all([weather.getAutomaticLocation(),weather.getAutomaticLocation()]);
 assert.equal(values[0].city,'murino');assert.equal(values[1].city,'murino');assert.equal(f.calls,1);
});
test('blocked storage still permits automatic updates with granted permission',async()=>{
 const f=fixture({blocked:true}),weather=f.open();await weather.getAutomaticLocation();f.move();f.advance(6*60000);
 assert.equal((await weather.getAutomaticLocation()).city,'moscow');assert.equal(f.calls,2);
});
test('malformed or future saved locations cannot suppress a location request',async()=>{
 const f=fixture();await f.open().getAutomaticLocation();const [key,raw]=[...f.storage.entries()][0];
 for(const value of ['broken',JSON.stringify({...JSON.parse(raw),at:Date.UTC(2026,10,12)}),JSON.stringify({...JSON.parse(raw),value:{city:'invalid',resolved:true}})]){
  const other=fixture({storage:new Map([[key,value]])});assert.equal((await other.open().getAutomaticLocation()).city,'murino');assert.equal(other.calls,1);
 }
});
