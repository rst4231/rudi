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

function contextNeeds(transcript) {
  const text=normalizeText(transcript);
  const broadToday=/\b(что у нас сегодня|что сегодня|планы на сегодня)\b/u.test(text);
  const smart=Boolean(commandIntent(transcript))||/(температур.*дом|дома.*температур|влажност|торшер|устройств|умн.*дом)/u.test(text);
  return {
    mood:/(настроен|как диан.*себя|как себя диан)/u.test(text),
    products:/(списк.*продукт|продукт.*спис|покупк|что купить|есть .* в продукт|есть ли .* продукт)/u.test(text),
    productHistory:/(что покупал|что купил|покупали|последн.*покуп)/u.test(text),
    wishlist:/(виш|wishlist|желани|хотелк)/u.test(text),
    cycle:/(цикл|месяч|овуляц|фертиль|критическ.*дн)/u.test(text),
    message:/(послан|сообщени.*послан)/u.test(text),
    feed:/(лент|концерт|стендап|stand up|кино|кинопремьер|премьер|факт)/u.test(text),
    lulu:/(лулу|lulu|выгул|гулял.*собак|собак.*гулял)/u.test(text),
    car:/(пробег|машин|авто|changan|uni v|уни в)/u.test(text),
    relationship:/(годовщин|сколько .* вместе|вместе с|лет вместе|месяц.*вместе|дн.*вместе)/u.test(text),
    activity:/(последн.*гулял|когда .* гулял|что произошло|последн.*активност)/u.test(text),
    calendar:broadToday||/(диан.*работ|работ.*диан|выходн|смен|рабоч.*день|календар|ближайш.*событ|событ.*календар)/u.test(text),
    holidays:broadToday||/(праздник|праздники)/u.test(text),
    tasks:broadToday||/(совместн.*дел|дела.*сегодня|задач|ticktick|ближайш.*событ|календар)/u.test(text),
    market:/(курс|доллар|usd|рубл|биткоин|bitcoin|btc|эфир|ethereum|eth|крипт)/u.test(text),
    smart,
  };
}

function compactValue(value, options = {}, depth = 0) {
  const arrayLimit=Math.max(1,Number(options.arrayLimit||12));
  const stringLimit=Math.max(40,Number(options.stringLimit||320));
  const maxDepth=Math.max(1,Number(options.maxDepth||4));
  if(value==null||typeof value==='number'||typeof value==='boolean') return value;
  if(typeof value==='string') return value.slice(0,stringLimit);
  if(depth>=maxDepth) return Array.isArray(value)?[]:{};
  if(Array.isArray(value)) return value.slice(0,arrayLimit).map(item=>compactValue(item,options,depth+1));
  if(typeof value==='object'){
    const out={};
    for(const [key,item] of Object.entries(value)) out[key]=compactValue(item,options,depth+1);
    return out;
  }
  return String(value).slice(0,stringLimit);
}

async function readAssistantContext(transcript, options = {}) {
  const now=options.now?new Date(options.now):new Date();
  const today=dateKey(now);
  const actor=String(options.actor||'Рустам');
  const wanted=contextNeeds(transcript);
  const context={currentDate:today,actor};

  const jobs=[];

  if(wanted.relationship) context.relationship=relationshipView(now);

  if(wanted.mood) jobs.push(
    readDailyMood(today,options)
      .then(row=>{context.mood=row?.moods||null})
      .catch(()=>{context.mood=null})
  );

  if(wanted.products||wanted.productHistory) jobs.push(
    readProductList(options)
      .then(products=>{
        context.products={};
        if(wanted.products){
          context.products.items=(products?.items||[]).slice(0,45).map(x=>({
            text:x.text,checked:Boolean(x.checked),addedBy:x.addedBy||''
          }));
        }
        if(wanted.productHistory){
          context.products.recentBought=(products?.history||[]).slice(0,12).map(x=>({
            text:x.text,boughtAt:x.boughtAt||'',boughtBy:x.boughtBy||''
          }));
        }
      })
      .catch(()=>{context.products={items:[]}})
  );

  if(wanted.wishlist) jobs.push(
    readWishlist(options)
      .then(wishlist=>{
        context.wishlist=(wishlist?.items||[]).slice(0,45).map(x=>({
          text:x.text,owner:x.owner,done:Boolean(x.done),createdAt:x.createdAt||''
        }));
      })
      .catch(()=>{context.wishlist=[]})
  );

  if(wanted.cycle) jobs.push(
    readCycleState(options)
      .then(cycle=>{context.cycle=cycle?{...cycleViewForDate(cycle,today),updatedAt:cycle.updatedAt||''}:null})
      .catch(()=>{context.cycle=null})
  );

  if(wanted.message) jobs.push(
    readPartnerMessage(options)
      .then(message=>{context.partnerMessage=message})
      .catch(()=>{context.partnerMessage=null})
  );

  if(wanted.feed) jobs.push(
    readFeedSnapshot(options)
      .then(feed=>{
        context.feed=feed?{
          date:feed.date,
          updatedAt:feed.updatedAt,
          sections:compactValue(feed.sections,{arrayLimit:10,stringLimit:280,maxDepth:5}),
        }:null;
      })
      .catch(()=>{context.feed=null})
  );

  if(wanted.lulu) jobs.push(
    readLuluState(options)
      .then(lulu=>{context.lulu=lulu?.lastWalk?{lastWalk:lulu.lastWalk}:null})
      .catch(()=>{context.lulu=null})
  );

  if(wanted.car) jobs.push(
    readCarState(options)
      .then(car=>{context.car={make:'Changan',model:'UNI-V',year:2023,mileage:car?.mileage??null,updatedAt:car?.updatedAt||''}})
      .catch(()=>{context.car={make:'Changan',model:'UNI-V',year:2023,mileage:null}})
  );

  if(wanted.activity) jobs.push(
    readActivityJournal(options)
      .then(activity=>{
        const rows=(activity?.items||[]).filter(x=>!/гулял|гуляла|прогул/i.test(transcript)||/гуля|прогул/i.test(String(x?.text||'')));
        context.recentActivity=rows.slice(0,12).map(x=>({
          text:x.text,actor:x.actor,createdAt:x.createdAt,type:x.type
        }));
      })
      .catch(()=>{context.recentActivity=[]})
  );

  if(wanted.calendar) jobs.push(
    getWorkWeek({...options,now,view:'week'})
      .then(calendar=>{
        context.workCalendar={
          configured:Boolean(calendar?.configured),
          stale:Boolean(calendar?.stale),
          today:(calendar?.days||[]).find(day=>day.date===today)||null,
          days:(calendar?.days||[]).slice(0,7).map(day=>({
            date:day.date,
            working:Boolean(day.working),
            events:compactValue(day.events||[],{arrayLimit:4,stringLimit:220,maxDepth:4}),
          })),
        };
      })
      .catch(error=>{context.workCalendar={error:String(error?.message||error),today:null,days:[]}})
  );

  if(wanted.holidays) jobs.push(
    getHolidayCalendar({...options,now,view:'month'})
      .then(holidays=>{
        context.holidays={
          date:today,
          items:compactValue((holidays.days||[]).find(day=>day.date===today)?.items||[],{arrayLimit:10,stringLimit:220,maxDepth:4}),
          source:'RUDI calendar',
        };
      })
      .catch(error=>{context.holidays={date:today,items:[],source:'RUDI calendar',error:String(error?.message||error)}})
  );

  if(wanted.tasks) jobs.push(
    tickTickView({...options,now}).then(value=>{context.sharedTasks=compactValue(value,{arrayLimit:12,stringLimit:240,maxDepth:4})})
  );

  if(wanted.market) jobs.push(
    readMarketTicker({...options,now})
      .then(value=>{context.market=compactValue(value,{arrayLimit:5,stringLimit:160,maxDepth:3})})
      .catch(error=>{context.market={error:String(error?.message||error),items:[]}})
  );

  if(wanted.smart) jobs.push(
    readSmartHomeSnapshot(false)
      .then(smart=>{
        const all=(smart?.devices||[]).map(deviceSummary);
        const devices=commandIntent(transcript)
          ? all.filter(hasOnOff)
          : all.filter(device=>hasOnOff(device)||(device.properties||[]).some(prop=>/temperature|humidity/.test(prop.instance)));
        context.smartHome={
          error:smart?.error||'',
          rooms:(smart?.rooms||[]).slice(0,15).map(x=>({id:x.id,name:x.name})),
          devices:devices.slice(0,30),
        };
      })
      .catch(error=>{context.smartHome={error:String(error?.message||error),devices:[],rooms:[]}})
  );

  await Promise.all(jobs);
  context.loaded=Object.keys(wanted).filter(key=>wanted[key]);
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

module.exports={dateKey,relationshipView,contextNeeds,compactValue,readAssistantContext,executeAssistantAction,commandIntent,selectDevice};
