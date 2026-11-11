const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const source=fs.readFileSync('public/weather.js','utf8');
function fixture({storage=new Map(),blocked=false}={}){
  let now=Date.UTC(2026,10,11,9),calls=0,denied=false;
  const localStorage={getItem(key){if(blocked)throw Error('blocked');return storage.get(key)||null},setItem(key,value){if(blocked)throw Error('blocked');storage.set(key,value)}};
  function open(){
    const context={window:{},Date:class extends Date{static now(){return now}},localStorage,
      navigator:{geolocation:{getCurrentPosition(resolve,reject){calls++;if(denied)return reject(Error('denied'));resolve({coords:{latitude:60.0479,longitude:30.452}})}}}};
    vm.runInNewContext(source,context);return context.window.RUDI_WEATHER;
  }
  return {storage,open,advance(ms){now+=ms},deny(){denied=true},get calls(){return calls}};
}
test('automatic city stays available for a day across page reloads without another location request',async()=>{
  const f=fixture(),weather=f.open();
  assert.equal((await weather.getAutomaticLocation()).city,'murino');
  f.advance(6*60*1000);
  assert.equal((await weather.getAutomaticLocation()).city,'murino');
  assert.equal(f.calls,1);
  f.advance(23*60*60*1000);
  assert.equal((await f.open().getAutomaticLocation()).city,'murino');
  assert.equal(f.calls,1);
});
test('automatic city is refreshed when the original day expires without a sliding extension',async()=>{
  const f=fixture();await f.open().getAutomaticLocation();
  f.advance(23*60*60*1000);await f.open().getAutomaticLocation();
  f.advance(60*60*1000);
  assert.equal((await f.open().getAutomaticLocation()).city,'murino');
  assert.equal(f.calls,2);
});
test('invalid persisted cities and timestamps cannot suppress a fresh location request',async()=>{
  const saved=fixture();await saved.open().getAutomaticLocation();
  const [key,raw]=[...saved.storage.entries()][0]||[];
  assert.ok(key,'a successful automatic city must be persisted');
  for(const value of ['broken',JSON.stringify({at:Date.UTC(2026,10,11,10),value:{city:'murino',resolved:true}}),JSON.stringify({...JSON.parse(raw),value:{city:'invalid',resolved:true}})]){
    const f=fixture({storage:new Map([[key,value]])});
    assert.equal((await f.open().getAutomaticLocation()).city,'murino');assert.equal(f.calls,1);
  }
});
test('blocked browser storage still reuses automatic city in memory',async()=>{
  const f=fixture({blocked:true}),weather=f.open();await weather.getAutomaticLocation();
  f.advance(6*60*1000);assert.equal((await weather.getAutomaticLocation()).resolved,true);assert.equal(f.calls,1);
});
test('failed location is not persisted as a successful city for the next launch',async()=>{
  const f=fixture();f.deny();assert.equal((await f.open().getAutomaticLocation()).resolved,false);
  assert.equal(f.storage.size,0);
});
