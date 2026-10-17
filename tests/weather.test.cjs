const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const sample={current:{time:'2026-09-30T19:00',temperature_2m:12,apparent_temperature:10,weather_code:3,precipitation:0,rain:0},hourly:{time:['2026-09-30T19:00','2026-09-30T20:00'],precipitation_probability:[0,10],precipitation:[0,0],rain:[0,0]},daily:{time:['2026-09-30','2026-10-01'],sunrise:['2026-09-30T06:56','2026-10-01T06:58'],sunset:['2026-09-30T18:34','2026-10-01T18:31'],temperature_2m_min:[7,8],temperature_2m_max:[14,15],precipitation_sum:[0,2]}};

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

test('server forecast includes sun times and hourly rain data for the home dashboard',async()=>{
  const {createWeatherService}=require('../api/weather.cjs');
  let requested='';
  const service=createWeatherService({fetchImpl:async url=>{requested=String(url);return {ok:true,json:async()=>sample}}});
  const value=await service();
  assert.match(requested,/hourly=precipitation_probability,precipitation,rain/);
  assert.match(requested,/sunrise,sunset/);
  assert.deepEqual(value.daily.sunrise,sample.daily.sunrise);
  assert.deepEqual(value.daily.sunset,sample.daily.sunset);
  assert.deepEqual(value.hourly,sample.hourly);
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
  const storage=new Map(cached?[['rudi-weather-v2',JSON.stringify(cached)]]:[]);
  const context=vm.createContext({window:{},Date,AbortController,setTimeout,clearTimeout,
    localStorage:{getItem:k=>storage.get(k),setItem:(k,v)=>storage.set(k,v)},fetch:fetchImpl});
  vm.runInContext(fs.readFileSync('public/weather.js','utf8'),context);
  return context.window.RUDI_WEATHER;
}

test('both browser widgets share one same-origin forecast request',async()=>{
  let calls=0;
  const weather=client({fetchImpl:async url=>{calls++;assert.equal(url,'/api/index?route=weather&forecast=v3');return {ok:true,json:async()=>({...sample,fetchedAt:Date.now(),stale:false})}}});
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

test('extended forecast requests 16 actual days with genuine hourly temperature and daily wind',async()=>{
 let requested='';
 const service=require('../api/weather.cjs').createWeatherService({fetchImpl:async url=>{requested=url;return {ok:true,json:async()=>sample}}});await service();
 const query=new URL(requested).searchParams;assert.equal(query.get('forecast_days'),'16');
 for(const field of ['temperature_2m','apparent_temperature','weather_code','wind_speed_10m'])assert.ok(query.get('hourly').split(',').includes(field));
 for(const field of ['wind_speed_10m_max','precipitation_probability_max'])assert.ok(query.get('daily').split(',').includes(field));
});
test('opening forecast refreshes a fresh old hourly-rain-only cache and still coalesces requests',async()=>{
 let calls=0;
 const extended={...sample,hourly:{...sample.hourly,temperature_2m:[12,9],apparent_temperature:[10,7],weather_code:[3,61],wind_speed_10m:[10,15]}};
 const weather=client({cached:{...sample,fetchedAt:Date.now(),stale:false},fetchImpl:async url=>{calls++;assert.match(url,/forecast=v3/);return {ok:true,json:async()=>({...extended,fetchedAt:Date.now()})}}});
 await weather.get();assert.equal(calls,0);
 const [a,b]=await Promise.all([weather.get({forecast:true}),weather.get({forecast:true})]);
 assert.equal(calls,1);assert.equal(a.hourly.temperature_2m[1],9);assert.equal(b.hourly.apparent_temperature[1],7);
});
test('forecast model never invents hourly temperature or future dates',()=>{
 const window={},document={addEventListener(){}};vm.runInNewContext(fs.readFileSync('public/weather-forecast.js','utf8'),{window,document});
 const model=window.RUDI_WEATHER_FORECAST.model(sample);
 assert.equal(model.days.length,2);assert.equal(model.hours.length,2);assert.equal(model.hours[0].temperature,undefined);assert.equal(model.days.some(day=>day.date==='2026-10-25'),false);
 const real=window.RUDI_WEATHER_FORECAST.model({...sample,hourly:{...sample.hourly,temperature_2m:[12,null],apparent_temperature:[10,null]}});
 assert.equal(real.hours[0].temperature,12);assert.equal(real.hours[1].temperature,null);
 const js=fs.readFileSync('public/weather-forecast.js','utf8');assert.match(js,/нет данных/);assert.match(js,/За этим горизонтом данных нет/);assert.match(js,/event\.key==='Escape'/);assert.match(js,/generation!==revision/);
});
