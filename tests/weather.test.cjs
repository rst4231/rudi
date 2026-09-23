const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const sample={current:{temperature_2m:12,weather_code:3,precipitation:0,rain:0},daily:{temperature_2m_min:[7,8],temperature_2m_max:[14,15],precipitation_sum:[0,2]}};

test('server combines concurrent forecast requests and caches successful data',async()=>{
  const {createWeatherService}=require('../api/weather.cjs');
  let count=0;
  const service=createWeatherService({fetchImpl:async()=>{count++;return {ok:true,json:async()=>sample}}});
  const [a,b]=await Promise.all([service(),service()]);
  assert.equal(a.current.temperature_2m,12);
  assert.deepEqual(a,b);
  await service();
  assert.equal(count,1);
});

test('server keeps recent forecast during an outage without extending its age',async()=>{
  const {createWeatherService}=require('../api/weather.cjs');
  let time=1000000,offline=false;
  const service=createWeatherService({now:()=>time,fetchImpl:async()=>{if(offline)throw Error('offline');return {ok:true,json:async()=>sample}}});
  const first=await service();
  time+=20*60*1000;offline=true;
  const stale=await service();
  assert.equal(stale.stale,true);
  assert.equal(stale.fetchedAt,first.fetchedAt);
  time+=3*60*60*1000;
  await assert.rejects(service());
});

test('malformed weather cannot turn a missing temperature into zero degrees',async()=>{
  const {createWeatherService}=require('../api/weather.cjs');
  const service=createWeatherService({fetchImpl:async()=>({ok:true,json:async()=>({...sample,current:{temperature_2m:null,weather_code:3}})})});
  await assert.rejects(service());
});

test('forecast timeout aborts the provider request',async()=>{
  const {createWeatherService}=require('../api/weather.cjs');
  let aborted=false;
  const service=createWeatherService({timeoutMs:10,fetchImpl:(_url,{signal})=>new Promise((_resolve,reject)=>signal.addEventListener('abort',()=>{aborted=true;reject(Error('aborted'))}))});
  await assert.rejects(service());
  assert.equal(aborted,true);
});

function client({cached,fetchImpl}){
  const storage=new Map(cached?[['rudi-weather-v1',JSON.stringify(cached)]]:[]);
  const context=vm.createContext({window:{},Date,AbortController,setTimeout,clearTimeout,
    localStorage:{getItem:k=>storage.get(k),setItem:(k,v)=>storage.set(k,v)},fetch:fetchImpl});
  vm.runInContext(fs.readFileSync('public/weather.js','utf8'),context);
  return context.window.RUDI_WEATHER;
}

test('both browser widgets share one same-origin forecast request',async()=>{
  let calls=0;
  const weather=client({fetchImpl:async url=>{calls++;assert.equal(url,'/api/index?route=weather');return {ok:true,json:async()=>({...sample,fetchedAt:Date.now(),stale:false})}}});
  const [a,b]=await Promise.all([weather.get(),weather.get()]);
  assert.equal(a.current.temperature_2m,12);assert.equal(b.current.temperature_2m,12);
  assert.equal(calls,1);
});

test('browser falls back to recent cached data but rejects an expired forecast',async()=>{
  const fetchImpl=async()=>{throw Error('offline')};
  const recent=client({cached:{...sample,fetchedAt:Date.now()-20*60*1000},fetchImpl});
  assert.equal((await recent.get()).stale,true);
  const expired=client({cached:{...sample,fetchedAt:Date.now()-3*60*60*1000},fetchImpl});
  await assert.rejects(expired.get());
});
