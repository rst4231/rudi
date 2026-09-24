const config = require('../rudi-config.json');
const { readDailyMood } = require('./daily-mood-store.cjs');
const {
  readProductList,
  addProducts,
  removeProduct: removeProductById,
  toggleProductChecked,
  markProductBought,
} = require('./product-list-store.cjs');
const {
  readWishlist,
  addWish: addWishFn,
  toggleWish,
  removeWish: removeWishById,
} = require('./wishlist-store.cjs');
const { readCycleState, cycleViewForDate } = require('./cycle-store.cjs');
const { readPartnerMessage } = require('./partner-message-store.cjs');
const { readFeedSnapshot } = require('./feed-store.cjs');
const { readLuluState, markLuluWalk } = require('./lulu-store.cjs');
const { readSavedItems, removeSavedItem } = require('./saved-items-store.cjs');
const { readForDiFeed } = require('./for-di-feed-store.cjs');
const { readCarState } = require('./car-store.cjs');
const { readActivityJournal } = require('./activity-journal-store.cjs');
const { getWorkWeek } = require('./work-calendar.cjs');
const { getHolidayCalendar } = require('./holiday-calendar.cjs');
const { readMarketTicker } = require('./market-ticker.cjs');
const { readSmartHomeSnapshot, switchSmartHomeDevice, runSmartHomeCapability } = require('./smart-home-client.cjs');
const { readToken } = require('./ticktick-store.cjs');
const { loadTickTickConfig, fetchProjectData, buildTickTickCalendar, chooseNextTask } = require('./ticktick-client.cjs');
const { getWeather } = require('./weather.cjs');

const DAY = 86400000;

function safeTimeZone(value) {
  const candidate=String(value||'').trim();
  if(candidate){
    try{new Intl.DateTimeFormat('en-US',{timeZone:candidate}).format(new Date());return candidate}catch(_){}
  }
  return 'Europe/Moscow';
}

function dateKey(value = new Date(), timeZone='Europe/Moscow') {
  const date = value instanceof Date ? value : new Date(value);
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-CA', {
    timeZone:safeTimeZone(timeZone),year:'numeric',month:'2-digit',day:'2-digit'
  }).formatToParts(date).filter(x=>x.type!=='literal').map(x=>[x.type,x.value]));
  return [parts.year,parts.month,parts.day].join('-');
}

function shiftDateKey(key,days){
  const [y,m,d]=String(key||'').split('-').map(Number);
  const value=new Date(Date.UTC(y,m-1,d+Number(days||0)));
  return [value.getUTCFullYear(),String(value.getUTCMonth()+1).padStart(2,'0'),String(value.getUTCDate()).padStart(2,'0')].join('-');
}

function localDateTime(value,timeZone){
  return new Intl.DateTimeFormat('ru-RU',{
    timeZone:safeTimeZone(timeZone),year:'numeric',month:'2-digit',day:'2-digit',
    hour:'2-digit',minute:'2-digit',hourCycle:'h23'
  }).format(value instanceof Date?value:new Date(value));
}

function relationshipView(now = new Date(), timeZone='Europe/Moscow') {
  const startedAt = String(config?.relationship?.startedAt || '').trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(startedAt)) return null;
  const today = dateKey(now,timeZone);
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
    const timeZone=safeTimeZone(options.timeZone);
    const today=dateKey(now,timeZone);
    const tomorrow=shiftDateKey(today,1);
    const current=buildTickTickCalendar(tasks,now,'month',timeZone);
    const nextMonth=buildTickTickCalendar(tasks,now,'next-month',timeZone);
    const dayFor=(key)=>current.days.find(day=>day.date===key)||nextMonth.days.find(day=>day.date===key)||{date:key,events:[]};
    const todayEvents=(dayFor(today).events||[]).filter(x=>!x.completed);
    const tomorrowEvents=(dayFor(tomorrow).events||[]).filter(x=>!x.completed);
    const next=chooseNextTask(tasks,now);
    return {
      connected:true,
      enabled:true,
      project:String(data?.project?.name||'Общий'),
      todayDate:today,
      tomorrowDate:tomorrow,
      today:todayEvents.slice(0,20),
      tomorrow:tomorrowEvents.slice(0,20),
      next:next?{title:String(next.title||''),startDate:next.startDate||next.dueDate||null,dueDate:next.dueDate||null}:null,
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

function tokenPresent(text,words){
  const padded=' '+String(text||'').trim()+' ';
  return words.some(word=>padded.includes(' '+word+' '));
}

function commandIntent(transcript) {
  const normalized=normalizeText(transcript);
  const pause=/(?:^|\s)(?:поставь|поставить)\s+(?:пылесос\s+)?на\s+паузу(?:\s|$)/u.test(normalized);
  const resume=tokenPresent(normalized,['продолжи','продолжить','возобнови','возобновить'])&&/пылесос|уборк/u.test(normalized);
  if(pause||resume) return {kind:'pause',value:pause,target:'пылесос'};
  const on=tokenPresent(normalized,['включи','включить','зажги','вруби','запусти','запустить']);
  const off=tokenPresent(normalized,['выключи','выключить','погаси','выруби','останови','остановить']);
  if(!on&&!off) return null;
  const value=on&&!off;
  const target=normalized
    .replace(/(?:^|\s)(включи|включить|зажги|вруби|запусти|запустить|выключи|выключить|погаси|выруби|останови|остановить|пожалуйста|устройство|умного|дома|умный|дом)(?=\s|$)/gu,' ')
    .replace(/\s+/g,' ').trim();
  return {kind:'switch',value,target};
}

function selectDevice(devices,target) {
  const source=(Array.isArray(devices)?devices:[]).filter(device=>hasOnOff(device)||(device.capabilities||[]).some(cap=>cap.instance==='pause'||cap.instance==='work_speed'));
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


const MOOD_LABELS = Object.freeze({
  sadness:'грусть',
  fear:'тревога',
  anger:'злость',
  joy:'радость',
  love:'любовь',
});

const APP_TAB_LABELS = Object.freeze({
  home:'главная',
  feed:'лента',
  schedule:'график',
  wishlist:'вишлист',
  photos:'фото',
  products:'продукты',
  saves:'сохранённое',
  'for-di':'для Ди',
});

function moodForAssistant(value) {
  const code=String(value?.mood||'').trim();
  if(!code) return null;
  return {value:MOOD_LABELS[code]||'не указано',updatedAt:String(value?.updatedAt||'')};
}

function effectiveTopicText(transcript, history=[]) {
  const current=normalizeText(transcript);
  if(!current) return '';
  const followUp=current.length<=48&&/^(?:а\s+)?(?:завтра|сегодня|сейчас|у\s+дианы|а\s+у\s+дианы|что\s+здесь|что\s+тут|а\s+погода|а\s+дела|а\s+работа)/u.test(current);
  if(!followUp) return current;
  const previous=[...(Array.isArray(history)?history:[])].reverse().find(item=>item?.role==='user'&&String(item?.content||'').trim());
  return previous ? normalizeText(previous.content)+' '+current : current;
}

function navigationIntent(transcript) {
  const text=normalizeText(transcript);
  if(!/(?:^|\s)(?:открой|открыть|покажи|перейди|перейти|зайди|зайти)(?:\s|$)/u.test(text)) return null;
  const rows=[
    ['for-di',/(?:для\s+ди|для\s+дианы)/u],
    ['wishlist',/(?:вишлист|wishlist|желани)/u],
    ['products',/(?:продукт|покупк)/u],
    ['schedule',/(?:график|календар|расписан)/u],
    ['photos',/(?:фото|альбом)/u],
    ['saves',/(?:сохраненн|сохраненк|сохранен)/u],
    ['feed',/(?:лент|событи|концерт|стендап|stand\s*up|кино)/u],
    ['home',/(?:главн|домой|домашн)/u],
  ];
  for(const [tab,re] of rows) if(re.test(text)) return {tab,label:APP_TAB_LABELS[tab]};
  return null;
}

function matchNamedItem(items, target, getText=(item)=>item?.text) {
  const needle=normalizeText(target);
  const rows=(Array.isArray(items)?items:[]).filter(Boolean);
  if(!needle) return {item:null,candidates:[]};
  const exact=rows.filter(item=>normalizeText(getText(item))===needle);
  if(exact.length===1) return {item:exact[0],candidates:[]};
  if(exact.length>1) return {item:null,candidates:exact};
  const partial=rows.filter(item=>{
    const value=normalizeText(getText(item));
    return value&&(value.includes(needle)||needle.includes(value));
  });
  if(partial.length===1) return {item:partial[0],candidates:[]};
  return {item:null,candidates:partial.slice(0,6)};
}

function cleanCommandText(value){
  return String(value||'').replace(/\s+/g,' ').replace(/\s+пожалуйста\s*$/iu,'').trim();
}

function splitCommandItems(value){
  return String(value||'')
    .split(/\s*(?:,|;|\s+и\s+)\s*/u)
    .map(item=>item.trim())
    .filter(Boolean)
    .slice(0,12);
}

function addProductIntent(transcript){
  const raw=cleanCommandText(transcript);
  const patterns=[
    /^(?:добавь|добавить|запиши|занеси)\s+(.+?)\s+(?:в|на)\s+(?:список\s+)?(?:продуктов|продукты|покупок)$/iu,
    /^(?:добавь|добавить|запиши|занеси)\s+(?:в|на)\s+(?:список\s+)?(?:продуктов|продукты|покупок)\s+(.+)$/iu,
  ];
  for(const re of patterns){
    const match=raw.match(re);
    if(match?.[1]) return {items:splitCommandItems(match[1])};
  }
  return null;
}

function addWishIntent(transcript,actor){
  const raw=cleanCommandText(transcript);
  const patterns=[
    /^(?:добавь|добавить|запиши|занеси)\s+(.+?)\s+(?:в|на)\s+(?:мой\s+|дианин\s+)?(?:вишлист|wishlist|список желаний)(?:\s+дианы)?$/iu,
    /^(?:добавь|добавить|запиши|занеси)\s+(?:в|на)\s+(?:мой\s+|дианин\s+)?(?:вишлист|wishlist|список желаний)(?:\s+дианы)?\s+(.+)$/iu,
  ];
  let items=[];
  for(const re of patterns){
    const match=raw.match(re);
    if(match?.[1]){items=splitCommandItems(match[1]);break;}
  }
  if(!items.length) return null;
  const owner=/дианин|вишлист\s+дианы|список желаний\s+дианы|диане\s+в/iu.test(raw)
    ?'Диана'
    :String(actor||'Рустам');
  return {items,owner:owner==='Диана'?'Диана':'Рустам'};
}

function removeProductIntent(transcript) {
  const raw=cleanCommandText(transcript);
  for(const re of [
    /^(?:удали|удалить|убери|убрать)\s+(.+?)\s+(?:из|со)\s+(?:списка\s+)?(?:продуктов|покупок)$/iu,
    /^(?:удали|удалить|убери|убрать)\s+(?:из|со)\s+(?:списка\s+)?(?:продуктов|покупок)\s+(.+)$/iu,
  ]) {
    const m=raw.match(re);
    if(m?.[1]) return {target:m[1].trim()};
  }
  return null;
}

function productToggleIntent(transcript) {
  const raw=cleanCommandText(transcript);
  for(const re of [
    /^(?:отметь|поставь\s+галочку\s+(?:на|для))\s+(.+?)\s+(?:в|на)\s+(?:списке\s+)?(?:продуктов|покупок)$/iu,
    /^(?:отметь|поставь\s+галочку\s+(?:на|для))\s+(?:в|на)\s+(?:списке\s+)?(?:продуктов|покупок)\s+(.+)$/iu,
  ]) {
    const m=raw.match(re);
    if(m?.[1]) return {target:m[1].trim()};
  }
  return null;
}

function productBoughtIntent(transcript) {
  const raw=cleanCommandText(transcript);
  const m=raw.match(/^(?:отметь|пометь)\s+(.+?)\s+(?:как\s+)?(?:купленн(?:ым|ой|ое)|куплено)(?:\s+в\s+(?:продуктах|покупках))?$/iu);
  return m?.[1]?{target:m[1].trim()}:null;
}

function removeWishIntent(transcript) {
  const raw=cleanCommandText(transcript);
  for(const re of [
    /^(?:удали|удалить|убери|убрать)\s+(.+?)\s+(?:из|со)\s+(?:моего\s+)?(?:вишлиста|wishlist|списка\s+желаний)$/iu,
    /^(?:удали|удалить|убери|убрать)\s+(?:из|со)\s+(?:моего\s+)?(?:вишлиста|wishlist|списка\s+желаний)\s+(.+)$/iu,
  ]) {
    const m=raw.match(re);
    if(m?.[1]) return {target:m[1].trim()};
  }
  return null;
}

function toggleWishIntent(transcript) {
  const raw=cleanCommandText(transcript);
  const m=raw.match(/^(?:отметь|пометь)\s+(.+?)\s+(?:в|на)\s+(?:моем\s+)?(?:вишлисте|wishlist|списке\s+желаний)\s+(?:выполненн(?:ым|ой)|исполненн(?:ым|ой))$/iu);
  return m?.[1]?{target:m[1].trim()}:null;
}

function removeSavedIntent(transcript) {
  const raw=cleanCommandText(transcript);
  for(const re of [
    /^(?:удали|удалить|убери|убрать)\s+(.+?)\s+(?:из|со)\s+сохраненн(?:ого|ых|ое)$/iu,
    /^(?:удали|удалить|убери|убрать)\s+(?:из|со)\s+сохраненн(?:ого|ых|ое)\s+(.+)$/iu,
  ]) {
    const m=raw.match(re);
    if(m?.[1]) return {target:m[1].trim()};
  }
  return null;
}

function luluWalkIntent(transcript) {
  const text=normalizeText(transcript);
  return /(?:погулял|погуляла|погуляли|гулял|гуляла).*?(?:лулу|lulu|собак)|(?:отметь|запиши).*?прогулк.*?(?:лулу|lulu|собак)/u.test(text);
}

function contextNeeds(transcript, options = {}) {
  const text=effectiveTopicText(transcript,options.history);
  const current=normalizeText(transcript);
  const broadToday=/(?:^|\s)(что у нас сегодня|что сегодня|планы на сегодня)(?:\s|$)/u.test(text);
  const statusDiana=/(статус.*диан|диан.*статус|какой статус)/u.test(text);
  const smart=Boolean(commandIntent(transcript))||/(температур.*дом|дома.*температур|влажност|торшер|пылесос|камер|устройств|умн.*дом)/u.test(text);
  const contextual=/^(?:что\s+здесь|что\s+тут|что\s+в\s+этом\s+разделе)$/u.test(current);
  const tab=String(options.ui?.tab||'');
  return {
    mood:/(настроен|как диан.*себя|как себя диан)/u.test(text),
    products:/(продукт|покупк|список покуп)/u.test(text)||(contextual&&tab==='products'),
    productHistory:/(что покупал|что купил|покупали|последн.*покуп)/u.test(text),
    wishlist:/(виш|wishlist|желани|хотелк)/u.test(text)||(contextual&&tab==='wishlist'),
    cycle:statusDiana||/(цикл|месяч|овуляц|фертиль|критическ.*дн)/u.test(text)||(contextual&&tab==='schedule'),
    message:/(послан|сообщени.*послан)/u.test(text),
    feed:/(лент|мероприят|событи.*лент|концерт|стендап|stand\s*up|кино|кинопремьер|премьер|факт)/u.test(text)||(contextual&&tab==='feed'),
    lulu:/(лулу|lulu|выгул|гулял.*собак|собак.*гулял)/u.test(text),
    car:/(пробег|машин|авто|changan|uni v|уни в)/u.test(text),
    relationship:/(годовщин|сколько .* вместе|вместе с|лет вместе|месяц.*вместе|дн.*вместе)/u.test(text),
    activity:/(последн.*гулял|когда .* гулял|что произошло|последн.*активност)/u.test(text),
    calendar:statusDiana||broadToday||/(диан.*работ|работ.*диан|выходн|смен|рабоч.*день|календар|ближайш.*событ|событ.*календар|завтра.*диан|диан.*завтра)/u.test(text)||(contextual&&tab==='schedule'),
    holidays:broadToday||/(праздник|праздники)/u.test(text)||(contextual&&tab==='schedule'),
    tasks:broadToday||/(совместн.*дел|дела.*сегодня|дела.*завтра|что.*завтра|план.*завтра|задач|ticktick|ближайш.*событ|календар)/u.test(text)||(contextual&&tab==='schedule'),
    market:/(курс|доллар|usd|рубл|биткоин|bitcoin|btc|эфир|ethereum|eth|крипт)/u.test(text),
    weather:/(погод|прогноз|дожд|снег|температур.*улиц|мыть.*машин|мойк.*машин|машин.*мойк)/u.test(text),
    saves:/(сохраненн|сохраненк|сохранен)/u.test(text)||(contextual&&tab==='saves'),
    forDi:/(для\s+ди|для\s+дианы)/u.test(text)||(contextual&&tab==='for-di'),
    smart,
  };
}

function weatherLabel(code){
  return ({0:'Ясно',1:'Преимущественно ясно',2:'Облачно',3:'Пасмурно',45:'Туман',48:'Туман',51:'Морось',53:'Морось',55:'Морось',61:'Дождь',63:'Дождь',65:'Сильный дождь',71:'Снег',73:'Снег',75:'Сильный снег',80:'Ливень',81:'Ливень',82:'Сильный ливень',95:'Гроза',96:'Гроза',99:'Гроза'})[Number(code)]||'Погода';
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
  const timeZone=safeTimeZone(options.timeZone);
  const today=dateKey(now,timeZone);
  const tomorrow=shiftDateKey(today,1);
  const actor=String(options.actor||'Рустам');
  const history=Array.isArray(options.history)?options.history:[];
  const ui=options.ui&&typeof options.ui==='object'?options.ui:{};
  const wanted=contextNeeds(transcript,{history,ui});
  const year=Number(today.slice(0,4));
  const nextNewYear=(year+1)+'-01-01';
  const context={
    currentDate:today,
    tomorrowDate:tomorrow,
    timeZone,
    localDateTime:localDateTime(now,timeZone),
    calendarBasics:{
      newYearDate:'01-01',
      nextNewYear,
      daysUntilNewYear:Math.max(0,Math.round((Date.parse(nextNewYear+'T00:00:00Z')-Date.parse(today+'T00:00:00Z'))/DAY))
    },
    actor,
    ui:{
      tab:APP_TAB_LABELS[String(ui.tab||'')]?String(ui.tab):'',
      tabLabel:APP_TAB_LABELS[String(ui.tab||'')]||'',
      selectedDate:String(ui.selectedDate||'').slice(0,20),
    }
  };

  const jobs=[];

  if(wanted.relationship) context.relationship=relationshipView(now,timeZone);

  if(wanted.mood) jobs.push(
    readDailyMood(today,options)
      .then(row=>{
        context.mood={
          'Рустам':moodForAssistant(row?.moods?.['Рустам']),
          'Диана':moodForAssistant(row?.moods?.['Диана']),
        };
      })
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
        const text=normalizeText(transcript);
        const all=feed?.sections||{};
        let sections=all;
        if(/мероприят|концерт|стендап|stand up|событи.*лент/u.test(text)) sections={events:all.events};
        else if(/кино|кинопремьер|премьер/u.test(text)) sections={cinema:all.cinema};
        else if(/факт/u.test(text)) sections={facts:all.facts};
        context.feed=feed?{date:feed.date,updatedAt:feed.updatedAt,sections:compactValue(sections,{arrayLimit:10,stringLimit:280,maxDepth:5})}:null;
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
    getWorkWeek({...options,now,timeZone,view:'week'})
      .then(calendar=>{
        context.workCalendar={
          configured:Boolean(calendar?.configured),
          stale:Boolean(calendar?.stale),
          today:(calendar?.days||[]).find(day=>day.date===today)||null,
          tomorrow:(calendar?.days||[]).find(day=>day.date===tomorrow)||null,
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
    tickTickView({...options,now,timeZone}).then(value=>{context.sharedTasks=compactValue(value,{arrayLimit:12,stringLimit:240,maxDepth:4})})
  );

  if(wanted.market) jobs.push(
    readMarketTicker({...options,now})
      .then(value=>{context.market=compactValue(value,{arrayLimit:5,stringLimit:160,maxDepth:3})})
      .catch(error=>{context.market={error:String(error?.message||error),items:[]}})
  );

  if(wanted.weather) jobs.push(
    getWeather()
      .then(data=>{
        const daily=data?.daily||{};
        const dates=Array.isArray(daily.time)?daily.time:[];
        const pick=(key,fallbackIndex)=>{
          const index=Math.max(0,dates.indexOf(key));
          const i=dates.includes(key)?dates.indexOf(key):fallbackIndex;
          return {
            date:key,
            weatherCode:daily.weather_code?.[i] ?? null,
            condition:weatherLabel(daily.weather_code?.[i]),
            min:daily.temperature_2m_min?.[i] ?? null,
            max:daily.temperature_2m_max?.[i] ?? null,
            precipitation:daily.precipitation_sum?.[i] ?? null,
          };
        };
        context.weather={
          city:'Санкт-Петербург',
          stale:Boolean(data?.stale),
          current:{
            temperature:data?.current?.temperature_2m ?? null,
            weatherCode:data?.current?.weather_code ?? null,
            condition:weatherLabel(data?.current?.weather_code),
            precipitation:data?.current?.precipitation ?? null,
            rain:data?.current?.rain ?? null,
          },
          today:pick(today,0),
          tomorrow:pick(tomorrow,1),
        };
      })
      .catch(error=>{context.weather={city:'Санкт-Петербург',error:String(error?.message||error)}})
  );

  if(wanted.saves) jobs.push(
    readSavedItems(options)
      .then(saved=>{
        context.savedItems=(saved?.items||[]).slice(0,24).map(item=>({
          id:item.id,
          type:item.type,
          title:String(item?.payload?.title||item?.payload?.name||'').slice(0,180),
          savedBy:item.savedBy||'',
          createdAt:item.createdAt||'',
        }));
      })
      .catch(()=>{context.savedItems=[]})
  );

  if(wanted.forDi) jobs.push(
    readForDiFeed(options)
      .then(feed=>{
        context.forDi=(feed?.items||[]).slice(0,12).map(item=>({
          text:String(item.text||'').slice(0,320),
          dateKey:item.dateKey||'',
          source:item.source||null,
        }));
      })
      .catch(()=>{context.forDi=[]})
  );

  if(wanted.smart) jobs.push(
    readSmartHomeSnapshot(false)
      .then(smart=>{
        const all=(smart?.devices||[]).map(deviceSummary);
        const devices=commandIntent(transcript)
          ? all.filter(device=>hasOnOff(device)||(device.capabilities||[]).some(cap=>cap.instance==='pause'||cap.instance==='work_speed'))
          : all.filter(device=>hasOnOff(device)||(device.capabilities||[]).some(cap=>cap.instance==='pause'||cap.instance==='work_speed')||(device.properties||[]).some(prop=>/temperature|humidity/.test(prop.instance)));
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
  const actor=String(options.actor||'Рустам');

  const nav=navigationIntent(transcript);
  if(nav) return {type:'app-navigate',performed:true,status:'CLIENT_PENDING',tab:nav.tab,label:nav.label};

  const addProduct=addProductIntent(transcript);
  if(addProduct?.items?.length){
    try{
      const before=await readProductList(options);
      const ids=new Set((before?.items||[]).map(item=>item.id));
      const state=await addProducts(addProduct.items,actor,options);
      const added=(state?.items||[]).filter(item=>!ids.has(item.id)).map(item=>item.text);
      return {type:'products-add',performed:true,items:added,requested:addProduct.items};
    }catch(error){
      return {type:'products-add',performed:false,error:String(error?.message||error),requested:addProduct.items};
    }
  }

  const productRemove=removeProductIntent(transcript);
  if(productRemove){
    try{
      const state=await readProductList(options);
      const match=matchNamedItem(state?.items,productRemove.target);
      if(!match.item) return {type:'products-remove',performed:false,error:match.candidates.length?'ambiguous':'not-found',candidates:match.candidates.map(item=>item.text)};
      await removeProductById(match.item.id,options);
      return {type:'products-remove',performed:true,item:match.item.text};
    }catch(error){return {type:'products-remove',performed:false,error:String(error?.message||error)}}
  }

  const bought=productBoughtIntent(transcript);
  if(bought){
    try{
      const state=await readProductList(options);
      const match=matchNamedItem(state?.items,bought.target);
      if(!match.item) return {type:'products-bought',performed:false,error:match.candidates.length?'ambiguous':'not-found',candidates:match.candidates.map(item=>item.text)};
      await markProductBought(match.item.id,actor,options);
      return {type:'products-bought',performed:true,item:match.item.text};
    }catch(error){return {type:'products-bought',performed:false,error:String(error?.message||error)}}
  }

  const productToggle=productToggleIntent(transcript);
  if(productToggle){
    try{
      const state=await readProductList(options);
      const match=matchNamedItem(state?.items,productToggle.target);
      if(!match.item) return {type:'products-toggle',performed:false,error:match.candidates.length?'ambiguous':'not-found',candidates:match.candidates.map(item=>item.text)};
      await toggleProductChecked(match.item.id,options);
      return {type:'products-toggle',performed:true,item:match.item.text,checked:!Boolean(match.item.checked)};
    }catch(error){return {type:'products-toggle',performed:false,error:String(error?.message||error)}}
  }

  const addWish=addWishIntent(transcript,actor);
  if(addWish?.items?.length){
    if(addWish.owner!==actor) return {type:'wishlist-add',performed:false,error:'wishlist-owner-forbidden'};
    const added=[];
    try{
      for(const item of addWish.items){
        const result=await addWishFn(item,'',actor,options);
        if(result?.item?.text) added.push(result.item.text);
      }
      return {type:'wishlist-add',performed:true,owner:actor,items:added};
    }catch(error){
      return {type:'wishlist-add',performed:false,owner:actor,items:added,error:String(error?.message||error)};
    }
  }

  const wishRemove=removeWishIntent(transcript);
  if(wishRemove){
    try{
      const state=await readWishlist(options);
      const own=(state?.items||[]).filter(item=>item.owner===actor);
      const match=matchNamedItem(own,wishRemove.target);
      if(!match.item) return {type:'wishlist-remove',performed:false,error:match.candidates.length?'ambiguous':'not-found',candidates:match.candidates.map(item=>item.text)};
      await removeWishById(match.item.id,options);
      return {type:'wishlist-remove',performed:true,item:match.item.text,owner:actor};
    }catch(error){return {type:'wishlist-remove',performed:false,error:String(error?.message||error)}}
  }

  const wishToggle=toggleWishIntent(transcript);
  if(wishToggle){
    try{
      const state=await readWishlist(options);
      const own=(state?.items||[]).filter(item=>item.owner===actor);
      const match=matchNamedItem(own,wishToggle.target);
      if(!match.item) return {type:'wishlist-toggle',performed:false,error:match.candidates.length?'ambiguous':'not-found',candidates:match.candidates.map(item=>item.text)};
      const result=await toggleWish(match.item.id,options);
      return {type:'wishlist-toggle',performed:true,item:match.item.text,done:Boolean(result?.item?.done),owner:actor};
    }catch(error){return {type:'wishlist-toggle',performed:false,error:String(error?.message||error)}}
  }

  const savedRemove=removeSavedIntent(transcript);
  if(savedRemove){
    try{
      const state=await readSavedItems(options);
      const match=matchNamedItem(state?.items,savedRemove.target,item=>item?.payload?.title||item?.payload?.name||'');
      if(!match.item) return {type:'saved-remove',performed:false,error:match.candidates.length?'ambiguous':'not-found',candidates:match.candidates.map(item=>item?.payload?.title||item?.payload?.name||'').filter(Boolean)};
      await removeSavedItem(match.item.id,options);
      return {type:'saved-remove',performed:true,item:String(match.item?.payload?.title||match.item?.payload?.name||'')};
    }catch(error){return {type:'saved-remove',performed:false,error:String(error?.message||error)}}
  }

  if(luluWalkIntent(transcript)){
    try{
      const lulu=await markLuluWalk(actor,options);
      return {type:'lulu-walk',performed:true,walkedAt:lulu?.lastWalk?.walkedAt||'',actor};
    }catch(error){return {type:'lulu-walk',performed:false,error:String(error?.message||error)}}
  }

  const intent=commandIntent(transcript);
  if(!intent) return null;
  const devices=context?.smartHome?.devices||[];
  const selected=selectDevice(devices,intent.target);
  if(!selected.device){
    return {type:'smart-home',performed:false,error:'device-not-found-or-ambiguous',candidates:selected.candidates.map(item=>item.name).filter(Boolean)};
  }

  const device=selected.device;
  const pauseCap=(device.capabilities||[]).find(cap=>cap.instance==='pause');
  if(intent.kind==='pause'){
    if(!pauseCap) return {type:'smart-home-pause',performed:false,device:device.name,error:'pause-not-supported'};
    try{
      const result=await runSmartHomeCapability(device.id,device.name,'devices.capabilities.toggle','pause',Boolean(intent.value),actor);
      return {type:'smart-home-pause',performed:String(result?.status||'')==='DONE',device:device.name,paused:Boolean(intent.value),status:String(result?.status||'')};
    }catch(error){
      return {type:'smart-home-pause',performed:false,device:device.name,error:String(error?.message||error)};
    }
  }

  const current=onOffState(device);
  if(intent.kind==='switch'&&current===intent.value){
    if(intent.value&&pauseCap?.value===true){
      try{
        const result=await runSmartHomeCapability(device.id,device.name,'devices.capabilities.toggle','pause',false,actor);
        return {type:'smart-home-switch',performed:String(result?.status||'')==='DONE',changed:true,device:device.name,state:true,resumed:true,status:String(result?.status||'')};
      }catch(error){
        return {type:'smart-home-switch',performed:false,device:device.name,error:String(error?.message||error)};
      }
    }
    return {type:'smart-home-switch',performed:true,changed:false,device:device.name,state:intent.value,status:'ALREADY'};
  }

  if(hasOnOff(device)){
    try{
      const result=await switchSmartHomeDevice(device.id,device.name,intent.value,actor);
      return {type:'smart-home-switch',performed:String(result?.status||'')==='DONE',changed:true,device:device.name,state:intent.value,status:String(result?.status||'')};
    }catch(error){
      return {type:'smart-home-switch',performed:false,device:device.name,state:intent.value,error:String(error?.message||error)};
    }
  }

  if(pauseCap){
    try{
      const result=await runSmartHomeCapability(device.id,device.name,'devices.capabilities.toggle','pause',!intent.value,actor);
      return {type:'smart-home-switch',performed:String(result?.status||'')==='DONE',device:device.name,state:intent.value,status:String(result?.status||'')};
    }catch(error){
      return {type:'smart-home-switch',performed:false,device:device.name,error:String(error?.message||error)};
    }
  }

  return {type:'smart-home',performed:false,device:device.name,error:'action-not-supported'};
}

module.exports={
  safeTimeZone,dateKey,shiftDateKey,relationshipView,contextNeeds,compactValue,
  addProductIntent,addWishIntent,removeProductIntent,removeWishIntent,navigationIntent,
  effectiveTopicText,moodForAssistant,readAssistantContext,executeAssistantAction,commandIntent,selectDevice,matchNamedItem
};
