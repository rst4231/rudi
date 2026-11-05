'use strict';
const FRESH=6*3600000,MAX_AGE=48*3600000;
function monthRange(now){
 const from=new Intl.DateTimeFormat('en-CA',{timeZone:'Europe/Moscow',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date(now));
 const [year,month]=from.slice(0,7).split('-').map(Number);
 return {from,month:from.slice(0,7),through:new Date(Date.UTC(year,month+1,0)).toISOString().slice(0,10)};
}
function createMonthlyWeatherService({fetchImpl=globalThis.fetch,now=Date.now,timeoutMs=10000,latitude=59.9386,longitude=30.3141}={}){
 let cached=null,flight=null,flightMonth='';
 return async function getMonthlyWeather(){
  const range=monthRange(now());
  if(cached?.month===range.month&&now()-cached.fetchedAt<FRESH)return cached;
  if(flight&&flightMonth===range.month)return flight;
  const request=(async()=>{
   const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),timeoutMs);
   try{
    const url=new URL('https://seasonal-api.open-meteo.com/v1/seasonal');
    for(const [key,value] of Object.entries({latitude,longitude,daily:'temperature_2m_min,temperature_2m_max',models:'ecmwf_seasonal_ensemble_mean_seamless',start_date:range.from,end_date:range.through,timezone:'Europe/Moscow'}))url.searchParams.set(key,String(value));
    const response=await fetchImpl(url.toString(),{signal:controller.signal});if(!response.ok)throw Error('Monthly weather unavailable');
    const daily=(await response.json())?.daily||{},dates=new Map();
    for(const [i,date] of (Array.isArray(daily.time)?daily.time:[]).entries()){
     const min=daily.temperature_2m_min?.[i],max=daily.temperature_2m_max?.[i];
     if(typeof date==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(date)&&date>=range.from&&date<=range.through&&Number.isFinite(min)&&Number.isFinite(max)&&min<=max)dates.set(date,{date,min,max});
    }
    if(!dates.size)throw Error('Invalid monthly forecast');
    const result={month:range.month,through:range.through,days:[...dates.values()].sort((a,b)=>a.date.localeCompare(b.date)),model:'ECMWF EC46 / SEAS5',fetchedAt:now(),stale:false};
    if(monthRange(now()).month===range.month)cached=result;
    return result;
   }catch(error){if(cached?.month===range.month&&now()-cached.fetchedAt<=MAX_AGE)return {...cached,stale:true};throw error}
   finally{clearTimeout(timer)}
  })();
  flight=request;flightMonth=range.month;
  try{return await request}finally{if(flight===request){flight=null;flightMonth=''}}
 };
}
module.exports={createMonthlyWeatherService,monthRange};
