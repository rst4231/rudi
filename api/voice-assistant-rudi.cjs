const config = require('../rudi-config.json');
const { readDailyMood } = require('./daily-mood-store.cjs');
const { readProductList } = require('./product-list-store.cjs');
const { readWishlist } = require('./wishlist-store.cjs');
const { readCycleState, cycleViewForDate } = require('./cycle-store.cjs');
const { readPartnerMessage } = require('./partner-message-store.cjs');
const { readFeedSnapshot } = require('./feed-store.cjs');
const { readLuluState } = require('./lulu-store.cjs');
const { readCarState } = require('./car-store.cjs');
const { readActivityJournal } = require('./activity-journal-store.cjs');
const { getWorkWeek } = require('./work-calendar.cjs');
const { getHolidayCalendar } = require('./holiday-calendar.cjs');
const { readMarketTicker } = require('./market-ticker.cjs');
const { readSmartHomeSnapshot, switchSmartHomeDevice } = require('./smart-home-client.cjs');
const { readToken } = require('./ticktick-store.cjs');
const { loadTickTickConfig, fetchProjectData, buildTickTickCalendar, chooseNextTask } = require('./ticktick-client.cjs');

const DAY = 86400000;

function dateKey(value = new Date()) {
  const date = value instanceof Date ? value : new Date(value);
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-CA', {
    timeZone:'Europe/Moscow',year:'numeric',month:'2-digit',day:'2-digit'
  }).formatToParts(date).filter(x=>x.type!=='literal').map(x=>[x.type,x.value]));
  return [parts.year,parts.month,parts.day].join('-');
}

function relationshipView(now = new Date()) {
  const startedAt = String(config?.relationship?.startedAt || '').trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(startedAt)) return null;
  const today = dateKey(now);
  const start = Date.parse(startedAt + 'T00:00:00Z');
  const current = Date.parse(today + 'T00:00:00Z');
  if (!Number.isFinite(start) || !Number.isFinite(current) || current < start) return null;
  const startParts = startedAt.split('-').map(Number);
  const todayParts = today.split('-').map(Number);
  let years = todayParts[0] - startParts[0];
  if (Date.UTC(startParts[0] + years, startParts[1]-1, startParts[2]) > current) years -= 1;
  let months = 0;
  while (months < 11 && Date.UTC(startParts[0] + years, startParts[1]-1 + months + 1, startParts[2]) <= current) months += 1;
  const cursor = Date.UTC(startParts[0] + years, startParts[1]-1 + months, startParts[2]);
  const days = Math.max(0, Math.floor((current - cursor) / DAY));
  return {
    title:String(config?.relationship?.title || 'Наша годовщина'),
    startedAt,
    years:Math.max(0,years),
    months,
    days,
    totalDays:Math.max(0,Math.floor((current-start)/DAY)),
  };
}

function normalizeText(value) {
  return String(value || '').toLocaleLowerCase('ru-RU').replace(/ё/g,'е').replace(/[^a-zа-я0-9]+/giu,' ').trim();
}

function needs(text, re) {
  return re.test(normalizeText(text));
}

function deviceSummary(device) {
  const capabilities=(Array.isArray(device?.capabilities)?device.capabilities:[]).map(cap=>({
    type:String(cap?.type||''),
    instance:String(cap?.state?.instance||cap?.parameters?.instance||''),
    value:cap?.state?.value ?? null,
  }));
  const properties=(Array.isArray(device?.properties)?device.properties:[]).map(prop=>({
    type:String(prop?.type||''),
    instance:String(prop?.parameters?.instance||prop?.state?.instance||''),
    value:prop?.state?.value ?? null,
    unit:String(prop?.parameters?.unit||''),
  }));
  return {
    id:String(device?.id||''),
    name:String(device?.name||''),
    type:String(device?.type||''),
    room:String(device?.room||''),
    capabilities,
    properties,
  };
}

async function tickTickView(options = {}) {
  try {
    const token=await readToken(options);
    if(!token?.accessToken) return {connected:false};
    const cfg=await loadTickTickConfig(options);
    if(cfg.enabled===false) return {connected:true,enabled:false};
    const data=await fetchProjectData(token.accessToken,cfg.projectId,options);
    const tasks=Array.isArray(data?.tasks)?data.tasks:[];
    const now=options.now?new Date(options.now):new Date();
    const calendar=buildTickTickCalendar(tasks,now,'month');
    const today=dateKey(now);
    const todayEvents=(calendar.days.find(day=>day.date===today)?.events||[]).filter(x=>!x.completed);
    const next=chooseNextTask(tasks,now);
    return {
      connected:true,
      enabled:true,
      project:String(data?.project?.name||'Общий'),
      today:todayEvents.slice(0,20),
      next:next?{
        title:String(next.title||''),
        startDate:next.startDate||next.dueDate||null,
        dueDate:next.dueDate||null,
      }:null,
    };
  } catch (error) {
    return {connected:true,error:String(error?.message||error)};
  }
}

function hasOnOff(device) {
  return (device?.capabilities||[]).some(cap=>cap.type==='devices.capabilities.on_off');
}

function onOffState(device) {
  const cap=(device?.capabilities||[]).find(item=>item.type==='devices.capabilities.on_off');
  return typeof cap?.state?.value==='boolean'?cap.state.value:null;
}

function commandIntent(transcript) {
  const normalized=normalizeText(transcript);
  const on=/\b(включи|включить|зажги|вруби)\b/u.test(normalized);
  const off=/\b(выключи|выключить|погаси|выруби)\b/u.test(normalized);
  if(!on&&!off) return null;
  const value=on&&!off;
  const target=normalized
    .replace(/\b(включи|включить|зажги|вруби|выключи|выключить|погаси|выруби|пожалуйста|устройство|умного|дома|умный|дом)\b/gu,' ')
    .replace(/\s+/g,' ').trim();
  return {value,target};
}

function selectDevice(devices,target) {
  const source=(Array.isArray(devices)?devices:[]).filter(hasOnOff);
  if(!source.length) return {device:null,candidates:[]};
  const needle=normalizeText(target);
  if(!needle) return {device:null,candidates:source.slice(0,5)};
  const words=new Set(needle.split(' ').filter(x=>x.length>1));
  const ranked=source.map(device=>{
    const name=normalizeText(device.name);
    let score=0;
    if(name===needle) score+=100;
    if(name.includes(needle)||needle.includes(name)) score+=50;
    for(const word of words) if(name.includes(word)) score+=10;
    return {device,score};
  }).filter(row=>row.score>0).sort((a,b)=>b.score-a.score);
  if(!ranked.length) return {device:null,candidates:source.slice(0,5)};
  if(ranked.length>1&&ranked[0].score===ranked[1].score) return {device:null,candidates:ranked.slice(0,5).map(x=>x.device)};
  return {device:ranked[0].device,candidates:[]};
}

async function readAssistantContext(transcript, options = {}) {
  const now=options.now?new Date(options.now):new Date();
  const today=dateKey(now);
  const actor=String(options.actor||'Рустам');
  const [mood,products,wishlist,cycle,message,feed,lulu,car,activity]=await Promise.all([
    readDailyMood(today,options).catch(()=>null),
    readProductList(options).catch(()=>({items:[],history:[]})),
    readWishlist(options).catch(()=>({items:[]})),
    readCycleState(options).catch(()=>null),
    readPartnerMessage(options).catch(()=>null),
    readFeedSnapshot(options).catch(()=>null),
    readLuluState(options).catch(()=>null),
    readCarState(options).catch(()=>null),
    readActivityJournal(options).catch(()=>({items:[]})),
  ]);

  const context={
    currentDate:today,
    actor,
    relationship:relationshipView(now),
    mood:mood?.moods||null,
    products:{
      items:(products?.items||[]).slice(0,80).map(x=>({text:x.text,checked:Boolean(x.checked),addedBy:x.addedBy||''})),
      recentBought:(products?.history||[]).slice(0,15).map(x=>({text:x.text,boughtAt:x.boughtAt||'',boughtBy:x.boughtBy||''})),
    },
    wishlist:(wishlist?.items||[]).slice(0,80).map(x=>({text:x.text,owner:x.owner,done:Boolean(x.done),createdAt:x.createdAt||''})),
    cycle:cycle?{...cycleViewForDate(cycle,today),updatedAt:cycle.updatedAt||''}:null,
    partnerMessage:message,
    feed:feed?{date:feed.date,updatedAt:feed.updatedAt,sections:feed.sections}:null,
    lulu:lulu?.lastWalk?{lastWalk:lulu.lastWalk}:null,
    car:{make:'Changan',model:'UNI-V',year:2023,mileage:car?.mileage??null,updatedAt:car?.updatedAt||''},
    recentActivity:(activity?.items||[]).slice(0,20).map(x=>({text:x.text,actor:x.actor,createdAt:x.createdAt,type:x.type})),
  };

  const calendarNeeded=needs(transcript,/(диан.*работ|работ.*диан|выходн|смен|календар|ближайш.*событ|событ.*календар)/u);
  const holidaysNeeded=needs(transcript,/(праздник|праздники)/u);
  const tasksNeeded=needs(transcript,/(совместн.*дел|дела.*сегодня|задач|ticktick|ближайш.*событ|календар)/u);
  const marketNeeded=needs(transcript,/(курс|доллар|usd|рубл|биткоин|bitcoin|btc|эфир|ethereum|eth|крипт)/u);
  const smartNeeded=Boolean(commandIntent(transcript))||needs(transcript,/(температур.*дом|дома.*температур|влажност|торшер|устройств|умн.*дом)/u);

  if(calendarNeeded){
    context.workCalendar=await getWorkWeek({...options,now,view:'week'}).catch(error=>({error:String(error?.message||error),days:[]}));
    context.workCalendar.today=(context.workCalendar.days||[]).find(day=>day.date===today)||null;
  }
  if(holidaysNeeded){
    const holidays=await getHolidayCalendar({...options,now,view:'month'}).catch(error=>({error:String(error?.message||error),days:[]}));
    context.holidays={date:today,items:(holidays.days||[]).find(day=>day.date===today)?.items||[],source:'RUDI calendar'};
  }
  if(tasksNeeded) context.sharedTasks=await tickTickView({...options,now});
  if(marketNeeded) context.market=await readMarketTicker({...options,now}).catch(error=>({error:String(error?.message||error),items:[]}));
  if(smartNeeded){
    const smart=await readSmartHomeSnapshot(false).catch(error=>({error:String(error?.message||error),devices:[],rooms:[]}));
    context.smartHome={
      error:smart?.error||'',
      rooms:(smart?.rooms||[]).map(x=>({id:x.id,name:x.name})),
      devices:(smart?.devices||[]).map(deviceSummary),
    };
  }

  return context;
}

async function executeAssistantAction(transcript, context, options = {}) {
  const intent=commandIntent(transcript);
  if(!intent) return null;
  const devices=context?.smartHome?.devices||[];
  const selected=selectDevice(devices,intent.target);
  if(!selected.device){
    return {
      type:'smart-home-switch',
      performed:false,
      requestedState:intent.value,
      error:'device-not-found-or-ambiguous',
      candidates:selected.candidates.map(x=>x.name).filter(Boolean),
    };
  }
  const current=onOffState(selected.device);
  if(current===intent.value){
    return {
      type:'smart-home-switch',
      performed:true,
      changed:false,
      device:selected.device.name,
      state:intent.value,
      status:'ALREADY',
    };
  }
  try{
    const result=await switchSmartHomeDevice(selected.device.id,selected.device.name,intent.value,String(options.actor||'Рустам'));
    return {
      type:'smart-home-switch',
      performed:String(result?.status||'')==='DONE',
      changed:true,
      device:selected.device.name,
      state:intent.value,
      status:String(result?.status||''),
    };
  }catch(error){
    return {
      type:'smart-home-switch',
      performed:false,
      device:selected.device.name,
      state:intent.value,
      error:String(error?.message||error),
    };
  }
}

module.exports={dateKey,relationshipView,readAssistantContext,executeAssistantAction,commandIntent,selectDevice};
