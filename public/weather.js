(() => {
  'use strict';
  function createCityClient(city){
  const suffix=city==='spb'?'':':'+city;
  const KEY = 'rudi-weather-v2'+suffix;
  const FRESH = 15 * 60 * 1000;
  const MAX_AGE = 2 * 60 * 60 * 1000;
  let cached = null, flight = null;
  function valid(value) {
    const daily=value?.daily;
    const days=Array.isArray(daily?.time)?daily.time.length:0;
    return Number.isFinite(value?.fetchedAt) && value.fetchedAt <= Date.now() + 60000
      && Number.isFinite(value?.current?.temperature_2m) && Number.isFinite(value?.current?.weather_code)
      && days>0
      && ['temperature_2m_min', 'temperature_2m_max', 'precipitation_sum'].every(key =>
        Array.isArray(daily?.[key]) && daily[key].length === days && daily[key].every(Number.isFinite))
      && ['time','sunrise','sunset'].every(key =>
        Array.isArray(daily?.[key]) && daily[key].length === days && daily[key].every(item=>typeof item==='string'&&item.length>0));
  }
  try { const saved = JSON.parse(localStorage.getItem(KEY)); if (valid(saved)) cached = saved; } catch (_) {}
  function extended(value){
    const hours=value?.hourly?.time?.length||0;
    return hours>0&&['temperature_2m','apparent_temperature','weather_code','wind_speed_10m','precipitation_probability','precipitation'].every(key=>Array.isArray(value.hourly[key])&&value.hourly[key].length===hours);
  }
  async function get({forecast=false}={}) {
    if (cached && !cached.stale && Date.now() - cached.fetchedAt < FRESH && (!forecast||extended(cached))) return cached;
    if (flight){const value=await flight;if(!forecast||extended(value))return value;return get({forecast:true})}
    flight = (async () => {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 8000);
      try {
        const response = await fetch('/api/index?route=weather&forecast=v3'+(city==='spb'?'':'&city='+city), {signal: controller.signal});
        if (!response.ok) throw new Error('Weather unavailable');
        const value = await response.json();
        if (!valid(value) || (forecast&&!extended(value)) || Date.now() - value.fetchedAt > MAX_AGE) throw new Error('Invalid forecast');
        cached = {...value, stale: !!value.stale || Date.now() - value.fetchedAt >= FRESH};
        try { localStorage.setItem(KEY, JSON.stringify(cached)); } catch (_) {}
        return cached;
      } catch (error) {
        if (cached && Date.now() - cached.fetchedAt <= MAX_AGE) return {...cached, stale: true};
        throw error;
      } finally { clearTimeout(timer); }
    })();
    try { return await flight; } finally { flight = null; }
  }
  const MONTH_KEY='rudi-weather-months-v1'+suffix,MONTH_FRESH=6*3600000,MONTH_MAX_AGE=48*3600000;
  let monthly=null,monthlyFlight=null;
  const currentMonth=()=>new Intl.DateTimeFormat('en-CA',{timeZone:'Europe/Moscow',year:'numeric',month:'2-digit'}).format(new Date());
  function validMonthly(value){
    return value?.month===currentMonth()&&Number.isFinite(value.fetchedAt)&&value.fetchedAt<=Date.now()+60000&&Date.now()-value.fetchedAt<=MONTH_MAX_AGE&&Array.isArray(value.days)&&value.days.length>0&&value.days.every(row=>typeof row.date==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(row.date)&&Number.isFinite(row.min)&&Number.isFinite(row.max)&&row.min<=row.max);
  }
  try{const saved=JSON.parse(localStorage.getItem(MONTH_KEY));if(validMonthly(saved))monthly=saved}catch(_){}
  async function getMonthly(){
    if(validMonthly(monthly)&&!monthly.stale&&Date.now()-monthly.fetchedAt<MONTH_FRESH)return monthly;
    if(monthlyFlight)return monthlyFlight;
    monthlyFlight=(async()=>{
      const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),12000);
      try{
        const response=await fetch('/api/index?route=weather&range=months'+(city==='spb'?'':'&city='+city),{signal:controller.signal});if(!response.ok)throw Error('Monthly weather unavailable');
        const value=await response.json();if(!validMonthly(value))throw Error('Invalid monthly forecast');
        monthly={...value,stale:!!value.stale||Date.now()-value.fetchedAt>=MONTH_FRESH};
        try{localStorage.setItem(MONTH_KEY,JSON.stringify(monthly))}catch(_){}return monthly;
      }catch(error){if(validMonthly(monthly))return {...monthly,stale:true};throw error}
      finally{clearTimeout(timer)}
    })();
    try{return await monthlyFlight}finally{monthlyFlight=null}
  }
  return {get,getMonthly};
  }
const locations={murino:{label:'Мурино',where:'Мурино',latitude:60.0479,longitude:30.452},spb:{label:'Санкт-Петербург',where:'Санкт-Петербурге',latitude:59.9386,longitude:30.3141},moscow:{label:'Москва',where:'Москве',latitude:55.7558,longitude:37.6173},belgorod:{label:'Белгород',where:'Белгороде',latitude:50.5954,longitude:36.5873},bali:{label:'Бали',where:'Бали',latitude:-8.65,longitude:115.2167},bangkok:{label:'Бангкок',where:'Бангкоке',latitude:13.7563,longitude:100.5018},antalya:{label:'Анталья',where:'Анталье',latitude:36.8969,longitude:30.7133},cairo:{label:'Каир',where:'Каире',latitude:30.0444,longitude:31.2357}};
  let automatic=null,locationFlight=null;
  function nearestCity(latitude,longitude){return Object.keys(locations).sort((a,b)=>{const distance=key=>{const place=locations[key],r=Math.PI/180;return Math.sin((latitude-place.latitude)*r/2)**2+Math.cos(latitude*r)*Math.cos(place.latitude*r)*Math.sin((longitude-place.longitude)*r/2)**2};return distance(a)-distance(b)})[0]}
  async function getAutomaticLocation(){
    if(automatic&&Date.now()-automatic.at<(automatic.value.resolved?300000:60000))return automatic.value;
    if(locationFlight)return locationFlight;
    locationFlight=(async()=>{
      let value;
      try{
        const position=await new Promise((resolve,reject)=>{
          if(!globalThis.navigator?.geolocation)return reject(Error('Location unavailable'));
          navigator.geolocation.getCurrentPosition(resolve,reject,{timeout:6000,maximumAge:300000});
        });
        const {latitude,longitude}=position.coords;
        if(!Number.isFinite(latitude)||!Number.isFinite(longitude)||Math.abs(latitude)>90||Math.abs(longitude)>180)throw Error('Invalid location');
        value={city:nearestCity(latitude,longitude),resolved:true,note:''};
      }catch(_){value={city:'spb',resolved:false,note:'Геопозиция недоступна. Показан Санкт-Петербург.'}}
      automatic={at:Date.now(),value};return value;
    })();
    try{return await locationFlight}finally{locationFlight=null}
  }
  async function getAutomatic(options={}){
    const location=await getAutomaticLocation();
    if(!location.resolved)return {location};
    return {...await client(location.city).get(options),location};
  }
  const clients=new Map();
  function client(city){const key=['murino','moscow','belgorod','bali','bangkok','antalya','cairo'].includes(city)?city:'spb';if(!clients.has(key))clients.set(key,createCityClient(key));return clients.get(key)}
  const selectionKey=()=> 'rudi:forecast-city:'+(globalThis.document?.body?.dataset?.rudiActor==='Диана'?'diana':'rustam');
  function getSelectedCity(){try{const value=localStorage.getItem(selectionKey());return value==='auto'||Object.hasOwn(locations,value)?value:'auto'}catch(_){return 'auto'}}
  function setSelectedCity(city){
    if(city!=='auto'&&!Object.hasOwn(locations,city))return;
    try{localStorage.setItem(selectionKey(),city)}catch(_){}
    window.dispatchEvent?.(new CustomEvent('rudi:weather-city-change',{detail:{city}}));
  }
  async function getSelected(options={},monthly=false){
    if(options.city)return monthly?client(options.city).getMonthly():client(options.city).get(options);
    const key=selectionKey(),choice=getSelectedCity();
    const location=choice==='auto'?await getAutomaticLocation():{city:choice,resolved:true,note:''};
    const data=await (monthly?client(location.city).getMonthly():client(location.city).get(options));
    if(key!==selectionKey()||choice!==getSelectedCity())throw Error('Weather selection changed');
    return {...data,location:{...location,automatic:choice==='auto'}};
  }
  function currentSummary(data){
    const c=data?.current||{},h=data?.hourly||{};
    if(!Number.isFinite(c.temperature_2m)||!Number.isFinite(c.weather_code))return null;
    const index=typeof c.time==='string'?(h.time||[]).indexOf(c.time.slice(0,13)+':00'):-1;
    const chance=index>=0?h.precipitation_probability?.[index]:null;
    const speed=Number.isFinite(c.wind_speed_10m)?c.wind_speed_10m:index>=0?h.wind_speed_10m?.[index]:null;
    return {temperature:c.temperature_2m,code:c.weather_code,probability:Number.isFinite(chance)&&chance>=0&&chance<=100?chance:null,wind:Number.isFinite(speed)&&speed>=0?Math.round(speed/3.6*10)/10:null};
  }
  window.RUDI_WEATHER = {locations,nearestCity,getAutomaticLocation,getAutomatic,getSelectedCity,setSelectedCity,get:getSelected,getMonthly:(options={})=>getSelected(options,true),currentSummary};
})();
