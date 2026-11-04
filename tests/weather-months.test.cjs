const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const {createMonthlyWeatherService}=require('../api/weather.cjs');
const sample={daily:{time:['2026-11-04','2026-11-20','2026-12-31','2027-01-01'],temperature_2m_min:[2,-1,-7,1],temperature_2m_max:[5,3,-2,3]}};
test('monthly provider covers the rest of this month and next, coalescing and caching requests',async()=>{
 let count=0,url;const service=createMonthlyWeatherService({now:()=>Date.parse('2026-11-04T10:00:00Z'),fetchImpl:async u=>{count++;url=new URL(u);return {ok:true,json:async()=>sample}}});
 const [a,b]=await Promise.all([service(),service()]);assert.deepEqual(a,b);assert.equal(count,1);assert.equal(a.month,'2026-11');assert.equal(a.through,'2026-12-31');assert.equal(a.days.length,3);assert.deepEqual(a.days[2],{date:'2026-12-31',min:-7,max:-2});assert.equal(url.searchParams.get('end_date'),'2026-12-31');assert.equal(url.searchParams.get('start_date'),'2026-11-04');assert.equal(url.searchParams.get('models'),'ecmwf_seasonal_ensemble_mean_seamless');await service();assert.equal(count,1);
});
test('monthly null rows never turn into zero and unordered min/max are discarded',async()=>{
 const service=createMonthlyWeatherService({now:()=>Date.parse('2026-11-04'),fetchImpl:async()=>({ok:true,json:async()=>({daily:{time:['2026-11-04','2026-11-05','2026-11-06'],temperature_2m_min:[null,10,-2],temperature_2m_max:[8,5,2]}})})});
 assert.deepEqual((await service()).days,[{date:'2026-11-06',min:-2,max:2}]);
});
test('Moscow year boundary invalidates the cached month and changes the requested range',async()=>{
 let now=Date.parse('2026-12-31T20:59:00Z'),calls=0;const service=createMonthlyWeatherService({now:()=>now,fetchImpl:async url=>{calls++;const q=new URL(url).searchParams;return {ok:true,json:async()=>({daily:{time:[q.get('start_date')],temperature_2m_min:[-5],temperature_2m_max:[0]}})}}});
 assert.equal((await service()).through,'2027-01-31');now+=120000;assert.equal((await service()).month,'2027-01');assert.equal((await service()).through,'2027-02-28');assert.equal(calls,2);
});
test('monthly outage uses bounded cached data without rewriting its timestamp',async()=>{
 let now=Date.parse('2026-11-04'),offline=false;const service=createMonthlyWeatherService({now:()=>now,fetchImpl:async()=>{if(offline)throw Error('offline');return {ok:true,json:async()=>sample}}});const first=await service();now+=7*3600000;offline=true;const saved=await service();assert.equal(saved.stale,true);assert.equal(saved.fetchedAt,first.fetchedAt);now+=48*3600000;await assert.rejects(service());
});
test('weather can be stored as the startup page independently for each household member',async()=>{
 const prefs=require('../api/ui-preferences-store.cjs'),rows=new Map(),options={uiPreferencesCache:{get:async key=>rows.get(key),set:async(key,value)=>rows.set(key,value)}};
 assert.equal(prefs.normalizeUiPreferencesState({startupTab:'weather'}).startupTab,'weather');for(const actor of ['Рустам','Диана'])assert.equal((await prefs.saveUiPreferences(actor,{startupTab:'weather'},options)).startupTab,'weather');
});
test('browser monthly request coalesces, persists and reuses data offline',async()=>{
 const fixed=Date.parse('2026-11-04T10:00:00Z');class Clock extends Date{constructor(...args){super(...(args.length?args:[fixed]))}static now(){return fixed}}
 const rows=new Map();let calls=0,offline=false;const context={window:{},Date:Clock,Intl,AbortController,setTimeout,clearTimeout,localStorage:{getItem:key=>rows.get(key),setItem:(key,value)=>rows.set(key,value)},fetch:async url=>{calls++;assert.match(url,/range=months/);if(offline)throw Error('offline');return {ok:true,json:async()=>({month:'2026-11',through:'2026-12-31',days:[{date:'2026-11-20',min:-1,max:3}],fetchedAt:fixed})}}};
 vm.runInNewContext(fs.readFileSync('public/weather.js','utf8'),context);const [a,b]=await Promise.all([context.window.RUDI_WEATHER.getMonthly(),context.window.RUDI_WEATHER.getMonthly()]);assert.equal(a.days[0].max,3);assert.equal(b.days[0].min,-1);assert.equal(calls,1);offline=true;await context.window.RUDI_WEATHER.getMonthly();assert.equal(calls,1);
});

test('current weather summary uses the matching hour, keeps zero chance and converts wind to m/s',()=>{
 const context={window:{},Date,Intl,AbortController,setTimeout,clearTimeout,localStorage:{getItem(){return null}},fetch(){}};vm.runInNewContext(fs.readFileSync('public/weather.js','utf8'),context);
 const weather=context.window.RUDI_WEATHER,data={current:{time:'2026-11-04T10:15',temperature_2m:1,weather_code:0},hourly:{time:['2026-11-04T09:00','2026-11-04T10:00'],precipitation_probability:[90,0],wind_speed_10m:[36,10.8]}};
 assert.equal(weather.currentSummary(data).probability,0);assert.equal(weather.currentSummary(data).wind,3);data.hourly.precipitation_probability[1]=null;data.hourly.wind_speed_10m[1]=null;assert.equal(weather.currentSummary(data).probability,null);assert.equal(weather.currentSummary(data).wind,null);data.current.temperature_2m=null;assert.equal(weather.currentSummary(data),null);
});

test('home temperature label includes emoji probability and wind without inventing missing readings',()=>{
 const app=fs.readFileSync('public/app.js','utf8'),source=app.slice(app.indexOf('      function homeWeatherInlineLabel(){'),app.indexOf('      function renderHomeDashboardDateWeather('));
 const context={homeWeatherCurrent:{temperature:1,code:0,probability:0,wind:3.2},homeWeatherEmoji:()=> '☀️'};vm.createContext(context);vm.runInContext(source+';this.label=homeWeatherInlineLabel;',context);
 assert.match(context.label(),/☀️\s+\+1°/);assert.match(context.label(),/☔\s+0%/);assert.match(context.label(),/💨\s+3,2\s+м\/с/);context.homeWeatherCurrent={temperature:1,code:0};assert.doesNotMatch(context.label(),/☔|💨/);
});
