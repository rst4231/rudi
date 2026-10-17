'use strict';
const {createHash}=require('node:crypto');
const {createRudiStateClient}=require('./rudi-state-client.cjs');
const {parseEvents,buildRange,rollingStart}=require('./work-calendar.cjs');
const NAMESPACE='rudi-personal-calendar-subscriptions-v1',CONFIG_KEY='diana-icloud';
const CACHE_NAMESPACE='rudi-personal-calendar-subscription-cache-v1';
const FRESH_MS=10*60*1000,STALE_MS=7*24*60*60*1000,MAX_BYTES=1024*1024;
const inflight=new Map(),hash=value=>createHash('sha256').update(value).digest('hex');
function normalizeUrl(value){
 let url;try{url=new URL(String(value||'').trim().replace(/^webcal:/i,'https:'))}catch(_){throw Error('calendar-subscription-url-invalid')}
 if(url.protocol!=='https:'||!/^p\d+-caldav\.icloud\.com$/i.test(url.hostname)||url.username||url.password||url.port||url.search||url.hash||
  !/^\/published\/[12]\/[A-Za-z0-9_-]{20,2048}$/.test(url.pathname))throw Error('calendar-subscription-url-invalid');
 return url.href;
}
async function fetchText(url,options){
 const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),8000);
 try{
  const response=await (options.fetchImpl||globalThis.fetch)(url,{headers:{Accept:'text/calendar'},redirect:'error',signal:controller.signal});
  if(!response.ok||response.status>=300)throw Error('calendar-subscription-fetch-failed');
  if(Number(response.headers?.get?.('content-length')||0)>MAX_BYTES)throw Error('calendar-subscription-too-large');
  let text='';
  if(response.body?.getReader){
   const reader=response.body.getReader(),decoder=new TextDecoder();let bytes=0;
   try{for(;;){const {done,value}=await reader.read();if(done)break;bytes+=value.byteLength;if(bytes>MAX_BYTES)throw Error('calendar-subscription-too-large');text+=decoder.decode(value,{stream:true})}text+=decoder.decode()}
   finally{await reader.cancel().catch(()=>{})}
  }else{text=await response.text();if(Buffer.byteLength(text,'utf8')>MAX_BYTES)throw Error('calendar-subscription-too-large')}
  if(!/^BEGIN:VCALENDAR\s*$/m.test(text)||!/^END:VCALENDAR\s*$/m.test(text))throw Error('calendar-subscription-invalid-feed');
  return text;
 }finally{clearTimeout(timer)}
}
const shift=(key,delta)=>{const date=new Date(key+'T12:00:00Z');date.setUTCDate(date.getUTCDate()+delta);return date.toISOString().slice(0,10)};
const WEEKDAYS=['SU','MO','TU','WE','TH','FR','SA'];
function monthDays(rule,key,anchor){
 const year=Number(key.slice(0,4)),month=Number(key.slice(5,7)),last=new Date(Date.UTC(year,month,0)).getUTCDate();
 const byday=String(rule.BYDAY||'').split(',').filter(Boolean),bymonthday=String(rule.BYMONTHDAY||'').split(',').filter(Boolean).map(Number);
 let candidates=[];
 for(let day=1;day<=last;day++){
  if(bymonthday.length&&!bymonthday.some(n=>(n>0?n:last+n+1)===day))continue;
  if(byday.length&&!byday.some(value=>{
   const match=value.match(/^([+-]?[1-5])?(SU|MO|TU|WE|TH|FR|SA)$/);
   if(!match)throw Error('calendar-subscription-recurrence-unsupported');
   if(WEEKDAYS[new Date(Date.UTC(year,month-1,day)).getUTCDay()]!==match[2])return false;
   const ordinal=Number(match[1]||0);return !ordinal||(ordinal>0?Math.floor((day-1)/7)+1===ordinal:-(Math.floor((last-day)/7)+1)===ordinal);
  }))continue;
  if(!byday.length&&!bymonthday.length&&day!==Number(anchor.slice(8)))continue;
  candidates.push(day);
 }
 if(rule.BYSETPOS){
  const positions=String(rule.BYSETPOS).split(',').map(Number);
  if(positions.some(n=>!Number.isInteger(n)||n===0||Math.abs(n)>366))throw Error('calendar-subscription-recurrence-unsupported');
  candidates=candidates.filter((day,index)=>positions.some(n=>(n>0?n-1:candidates.length+n)===index));
 }
 return candidates;
}
function ruleMatches(rule,anchor,key){
 if(key<anchor)return false;
 const every=Number(rule.INTERVAL||1);if(!Number.isInteger(every)||every<1||every>10000)throw Error('calendar-subscription-recurrence-unsupported');
 const months=(Number(key.slice(0,4))-Number(anchor.slice(0,4)))*12+Number(key.slice(5,7))-Number(anchor.slice(5,7));
 const delta=(Date.parse(key+'T00:00Z')-Date.parse(anchor+'T00:00Z'))/86400000;
 const bymonth=String(rule.BYMONTH||'').split(',').filter(Boolean).map(Number);
 if(bymonth.length&&!bymonth.includes(Number(key.slice(5,7))))return false;
 const weekday=new Date(key+'T00:00Z').getUTCDay(),byday=String(rule.BYDAY||'').split(',').filter(Boolean);
 if(rule.FREQ==='DAILY')return delta%every===0&&(!byday.length||byday.includes(WEEKDAYS[weekday]));
 if(rule.FREQ==='WEEKLY'){
  const weekStart=WEEKDAYS.indexOf(rule.WKST||'MO');if(weekStart<0)throw Error('calendar-subscription-recurrence-unsupported');
  const offset=(new Date(anchor+'T00:00Z').getUTCDay()-weekStart+7)%7;
  return Math.floor((delta+offset)/7)%every===0&&(byday.length?byday:[WEEKDAYS[new Date(anchor+'T00:00Z').getUTCDay()]]).includes(WEEKDAYS[weekday]);
 }
 if(rule.FREQ==='MONTHLY')return months%every===0&&monthDays(rule,key,anchor).includes(Number(key.slice(8)));
 if(rule.FREQ==='YEARLY'){
  if((Number(key.slice(0,4))-Number(anchor.slice(0,4)))%every!==0)return false;
  if(!bymonth.length&&key.slice(5,7)!==anchor.slice(5,7))return false;
  return monthDays(rule,key,anchor).includes(Number(key.slice(8)));
 }
 throw Error('calendar-subscription-recurrence-unsupported');
}
function rangeRule(event,month,count,budget){
 if(!event.rrule||!event.start)return event;
 const rule=event.rrule,known=new Set(['FREQ','INTERVAL','COUNT','UNTIL','BYDAY','BYMONTHDAY','BYMONTH','BYSETPOS','WKST']);
 if(Object.keys(rule).some(key=>!known.has(key)))throw Error('calendar-subscription-recurrence-unsupported');
 // Unsupported daily/weekly numeric weekday and compound rules fail closed.
 if(['DAILY','WEEKLY'].includes(rule.FREQ)&&(rule.BYSETPOS||rule.BYMONTHDAY||String(rule.BYDAY||'').split(',').some(day=>day&&!WEEKDAYS.includes(day))))throw Error('calendar-subscription-recurrence-unsupported');
 const bounded=enforceCount(event,month+'-'+String(count),budget),anchor=rollingStart(event.start.date,'Europe/Moscow');
 const excluded=[...(event.exdates||[])];
 for(let n=1;n<=count;n++){
  const key=month+'-'+String(n).padStart(2,'0');
  if(!ruleMatches(rule,anchor,key))excluded.push({allDay:true,date:new Date(key+'T09:00Z')});
 }
 return {...bounded,exdates:excluded,rrule:{FREQ:'DAILY',...(bounded.rrule.UNTIL?{UNTIL:bounded.rrule.UNTIL}:{})}};
}
// buildRange handles overrides and exclusions. Enforce finite COUNT first;
// the shift-calendar parser's generic expansion intentionally ignores COUNT.
function enforceCount(event,endKey,budget){
 const rule=event.rrule;if(!rule?.COUNT||!event.start)return event;
 const count=Number(rule.COUNT);if(!Number.isInteger(count)||count<1||count>10000)throw Error('calendar-subscription-recurrence-limit');
 const start=rollingStart(event.start.date,'Europe/Moscow');
 let seen=0,until='';
 for(let key=start;key<=endKey;key=shift(key,1)){
  if(--budget.remaining<0)throw Error('calendar-subscription-recurrence-limit');
  if(ruleMatches(rule,start,key)&&++seen===count){until=key.replaceAll('-','');break}
 }
 if(until&&(!rule.UNTIL||String(rule.UNTIL).slice(0,8)>until))return {...event,rrule:{...rule,UNTIL:until}};
 return event;
}
function feedTasks(text,month){
 if(!/^20\d{2}-(0[1-9]|1[0-2])$/.test(month))throw Error('calendar-month-invalid');
 const count=new Date(Date.UTC(Number(month.slice(0,4)),Number(month.slice(5,7)),0)).getUTCDate();
 const events=parseEvents(text,'Europe/Moscow');
 if(events.length>5000)throw Error('calendar-subscription-too-large');
 const groups=new Map(),budget={remaining:500000};
 for(const event of events){
  const uid=event.uid||hash(String(event.summary||'')+String(event.start?.raw||''));
  if(!groups.has(uid))groups.set(uid,[]);
  groups.get(uid).push(rangeRule(event,month,count,budget));
 }
 const tasks=[];
 for(const [uid,group] of groups){
  for(const day of buildRange(group,month+'-01',count,'Europe/Moscow'))for(const item of day.events){
   const id='icloud-'+hash(uid+'|'+day.date).slice(0,40);
   if(tasks.some(task=>task.id===id))continue;
   tasks.push({id,title:String(item.title||'Событие').slice(0,500),date:day.date,startTime:item.startTime||'',endTime:item.endTime||'',allDay:item.allDay,
    description:'',personal:true,privateLocal:true,externalCalendar:true,calendarSource:'icloud',responsible:'Диана',ownerScope:'diana',assigned:false,
    projectId:'',projectName:'iCloud',canEdit:false,canComplete:false,canDelete:false});
  }
 }
 return tasks;
}
async function subscribedEvents(input,options={}){
 if(input.actor!=='Диана')throw Error('calendar-owner-forbidden');
 const client=options.client||createRudiStateClient(options),now=new Date(options.now||Date.now()).getTime();
 const config=(await client.getRecord(NAMESPACE,CONFIG_KEY))?.value;
 if(!config?.enabled||!config.url)return {tasks:[],subscribed:false};
 const url=normalizeUrl(config.url),key=hash(url),month=String(input.month||rollingStart(new Date(now),'Europe/Moscow').slice(0,7));
 const cached=(await client.getRecord(CACHE_NAMESPACE,key))?.value;
 let feed=cached,stale=false;
 if(!feed?.text||now-Number(feed.fetchedAt||0)>=FRESH_MS){
  if(!inflight.has(key)){
   const fetch=fetchText(url,options).then(async text=>{
    // Validate before replacing the previous known-good feed.
    feedTasks(text,month);
    const value={text,fetchedAt:now};await client.set(CACHE_NAMESPACE,key,value,{ttl:STALE_MS/1000});return value;
   }).finally(()=>inflight.delete(key));inflight.set(key,fetch);
  }
  try{feed=await inflight.get(key)}catch(_){
   if(!cached?.text||now-Number(cached.fetchedAt||0)>STALE_MS)return {tasks:[],subscribed:true,unavailable:true};
   feed=cached;stale=true;
  }
 }
 try{return {tasks:feedTasks(feed.text,month),subscribed:true,stale}}
 catch(_){return {tasks:[],subscribed:true,unavailable:true}}
}
module.exports={NAMESPACE,CONFIG_KEY,normalizeUrl,feedTasks,subscribedEvents};
