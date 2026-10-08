'use strict';

const { authorizeRequest, statusForError } = require('./rudi-request-auth.cjs');
const { readAppState, writeAppState } = require('./rudi-auth-db.cjs');
const { readFinanceState, viewState } = require('./finance-store.cjs');
const { readCarState } = require('./car-store.cjs');
const { readToken } = require('./ticktick-store.cjs');
const { loadTickTickConfig, fetchProjectData, buildTickTickCalendar, resolveAssigneeName } = require('./ticktick-client.cjs');

const FEEDBACK_KEY = 'recommendations:feedback-v1';
const RULES_KEY = 'recommendations:rules-v1';
const DEFAULT_RULES = Object.freeze({
  spendingRisePercent: 25, spendingMinPrevious: 1500, spendingMinCurrent: 2500,
  upcomingDays: 5, taskOverloadCount: 8, lowHumidity: 40,
  humidityFreshHours: 6, serviceWithinKm: 500, carFreshDays: 90, maxItems: 3
});
const RULE_LIMITS = Object.freeze({
  spendingRisePercent:[10,150], spendingMinPrevious:[500,50000], spendingMinCurrent:[500,100000],
  upcomingDays:[1,14], taskOverloadCount:[5,30], lowHumidity:[25,50],
  humidityFreshHours:[1,24], serviceWithinKm:[100,2000], carFreshDays:[15,365], maxItems:[1,5]
});
function rulesFrom(value={}) {
  const input=value && typeof value==='object' && !Array.isArray(value) ? value : {};
  const result={...DEFAULT_RULES};
  for(const [key,[min,max]] of Object.entries(RULE_LIMITS)){
    if(!Object.prototype.hasOwnProperty.call(input,key)) continue;
    const value=Number(input[key]);
    if(Number.isFinite(value) && value>=min && value<=max) result[key]=Math.round(value);
  }
  return result;
}
function moscowDate(now=new Date()) {
  const date=new Date(now);
  if(!Number.isFinite(date.getTime())) return '';
  const p=Object.fromEntries(new Intl.DateTimeFormat('en-US',{
    timeZone:'Europe/Moscow',year:'numeric',month:'2-digit',day:'2-digit'
  }).formatToParts(date).filter(x=>x.type!=='literal').map(x=>[x.type,x.value]));
  return [p.year,p.month,p.day].join('-');
}
function precedingMonth(month) {
  const [y,m]=month.split('-').map(Number);
  return new Date(Date.UTC(y,m-2,1)).toISOString().slice(0,7);
}
function rub(value){ return Math.round(Number(value)||0).toLocaleString('ru-RU')+' ₽'; }
function dueDays(day, today, max) {
  const base=Date.parse(today+'T00:00:00Z');
  if(!Number.isFinite(base)) return [];
  const output=[];
  for(let days=0;days<=max;days++){
    const date=new Date(base+days*86400000);
    const last=new Date(Date.UTC(date.getUTCFullYear(),date.getUTCMonth()+1,0)).getUTCDate();
    if(Math.min(Math.max(1,Number(day)||1),last)===date.getUTCDate()) output.push({days,month:date.toISOString().slice(0,7)});
  }
  return output;
}
function nextService(mileage) {
  if(!Number.isInteger(mileage)||mileage<0) return null;
  if(mileage<=5000) return 5000;
  return 5000+Math.ceil((mileage-5000)/10000)*10000;
}
function buildRecommendations({finance=null,taskCount=null,humidity=null,car=null,now=new Date(),rules={}}={}) {
  const cfg=rulesFrom(rules);
  const today=moscowDate(now),month=today.slice(0,7),prevMonth=precedingMonth(month);
  const result=[];
  const push=(value)=>result.push(value);
  if(finance && typeof finance==='object'){
    const expenses=Array.isArray(finance.personalExpenses)?finance.personalExpenses:[];
    const categories=Array.isArray(finance.categories)?finance.categories:[];
    for(const category of categories){
      if(!/еда|продукт|питани/ui.test(String(category?.name||''))) continue;
      const own=expenses.filter(x=>String(x?.categoryId||'')===String(category?.id||'')&&!x?.manualAdjustment);
      const total=(target)=>own.filter(x=>String(x?.month||'')===target).reduce((n,x)=>n+Math.max(0,Number(x?.rubAmount ?? x?.amount)||0),0);
      const current=total(month), previous=total(prevMonth), count=own.filter(x=>x?.month===month).length;
      // Current month-to-date is compared against the ENTIRE preceding month,
      // so the warning never depends on extrapolating partial-month spend.
      if(previous<cfg.spendingMinPrevious||current<cfg.spendingMinCurrent||count<3
          ||current<previous*(1+cfg.spendingRisePercent/100)) continue;
      const rise=Math.round((current/previous-1)*100);
      push({id:'spending:'+month+':'+String(category.id||'other').replace(/[^a-z0-9_-]/gi,'').slice(0,70),
        severity:'attention',priority:50,icon:'🛒',title:'Расходы на продукты выросли',
        detail:'За текущий месяц '+rub(current)+' против '+rub(previous)+' за весь прошлый (+'+rise+'%). Стоит проверить покупки.',
        action:'Проверить расходы',tab:'finances'});
    }
    const obligations=Array.isArray(finance.plan?.obligations)?finance.plan.obligations:[];
    const rubWallets=(Array.isArray(finance.wallets)?finance.wallets:[]).filter(w=>w?.currency==='RUB'&&w?.type!=='credit');
    const rubBalance=rubWallets.reduce((sum,w)=>sum+Math.max(0,Number(w.balance)||0),0);
    for(const obligation of obligations){
      if(obligation?.active===false || !(Number(obligation?.amount)>0)) continue;
      for(const due of dueDays(obligation.day,today,cfg.upcomingDays)){
        if((obligation.paidMonths||[]).includes(due.month)) continue;
        const amount=Number(obligation.amount);
        const short=rubWallets.length>0 && rubBalance<amount;
        const when=due.days===0?'Сегодня':due.days===1?'Завтра':'Через '+due.days+' дн.';
        push({id:'payment:'+due.month+':'+String(obligation.id||'').replace(/[^a-z0-9_-]/gi,'').slice(0,75),
          severity:short?'urgent':'attention',priority:short?95:75,icon:'💳',
          title:when+' платёж: '+String(obligation.title||'Платёж').slice(0,65),
          detail:rub(amount)+(short?' · На рублёвых кошельках '+rub(rubBalance)+'. Проверь, хватит ли средств.':' · Пока не отмечен оплаченным.'),
          action:'Открыть платежи',tab:'finances'});
      }
    }
  }
  if(Number.isInteger(taskCount)&&taskCount>=cfg.taskOverloadCount){
    push({id:'tasks:'+today,severity:'attention',priority:40,icon:'✅',
      title:'На сегодня много дел',
      detail:'Запланировано '+taskCount+' невыполненных дел. Проверь приоритеты и перенеси необязательные.',
      action:'Посмотреть дела',tab:'home',target:'priority'});
  }
  const humidityValue=Number(humidity?.value);
  const measured=Date.parse(String(humidity?.updatedAt||''))||0;
  const ageMs=now.getTime()-measured;
  if(humidity && humidity.value!==null && humidity.value!==undefined && Number.isFinite(humidityValue) && humidityValue>=0 && humidityValue<cfg.lowHumidity
     && measured>0 && ageMs>=0 && ageMs<=cfg.humidityFreshHours*3600000){
    const week=Math.floor(Date.parse(today+'T00:00:00Z')/(7*86400000));
    push({id:'humidity:'+week,severity:'attention',priority:65,icon:'💧',
      title:'Дома сухой воздух',
      detail:'Последнее измерение влажности: '+Math.round(humidityValue)+'%. Проверь увлажнитель.',
      action:'Открыть умный дом',tab:'home',target:'smart-home'});
  }
  const mileage=car?.mileage;
  const carMeasured=Date.parse(String(car?.mileageUpdatedAt||''))||0;
  const carAge=now.getTime()-carMeasured;
  if(Number.isInteger(mileage) && carMeasured>0 && carAge>=0 && carAge<=cfg.carFreshDays*86400000){
    const service=nextService(mileage);
    const left=service-mileage;
    const recentlyServiced=car?.lastServiceAt && Date.parse(car.lastServiceAt+'T00:00:00Z')>=now.getTime()-30*86400000;
    if(service!==null && left>=0 && left<=cfg.serviceWithinKm && !recentlyServiced){
      push({id:'service:'+service,severity:'attention',priority:70,icon:'🚗',
        title:'Приближается ТО автомобиля',
        detail:'Пробег '+mileage.toLocaleString('ru-RU')+' км, до планового ТО '+left.toLocaleString('ru-RU')+' км. Уточни регламент обслуживания.',
        action:'Открыть автомобиль',tab:'car'});
    }
  }
  return result.sort((a,b)=>b.priority-a.priority || a.id.localeCompare(b.id)).slice(0,30);
}
function feedbackFrom(input){
  const rows=input?.entries && typeof input.entries==='object' && !Array.isArray(input.entries)?input.entries:{};
  const entries={};
  for(const [id,row] of Object.entries(rows).slice(-150)){
    if(!/^[a-z0-9:_-]{1,110}$/i.test(id))continue;
    if(!['hide','snooze'].includes(row?.action))continue;
    const until=Number(row?.until||0);
    entries[id]={action:row.action,until:row.action==='hide'?0:(Number.isFinite(until)?until:0)};
  }
  return {entries};
}
function visibleRecommendations(items,feedback={},now=Date.now(),max=3){
  const records=feedbackFrom(feedback).entries;
  return items.filter(item=>{
    const entry=records[item.id];
    return !entry || (entry.action==='snooze' && entry.until<=now);
  }).slice(0,Math.max(1,Math.min(5,Number(max)||3)));
}
async function getSources(actor,options={}){
  const jobs={
    finance:()=>readFinanceState(options.financeOptions||{}).then(s=>viewState(s,actor)),
    tasks:async()=>{
      const token=await readToken(options.ticktickOptions||{});
      if(!token?.accessToken)return null;
      const cfg=await loadTickTickConfig({fetchImpl:options.fetchImpl||globalThis.fetch});
      if(!cfg.enabled)return null;
      const data=await fetchProjectData(token.accessToken,cfg.projectId,{fetchImpl:options.fetchImpl||globalThis.fetch,readAttempts:1,readTimeoutMs:5000});
      const now=new Date(options.now||Date.now()),today=moscowDate(now);
      const daily=buildTickTickCalendar(data?.tasks||[],now,'month').days.find(d=>d.date===today)?.events||[];
      const sourceById=new Map((data?.tasks||[]).map(t=>[String(t.id),t]));
      return daily.filter(t=>{
        if(t.completed)return false;
        const source=sourceById.get(String(t.id));
        const assigned=String(source?.assigneeUsername||'').trim();
        return !assigned || resolveAssigneeName(assigned)===actor;
      }).length;
    },
    humidity:()=>readAppState('Рустам','smart-home:humidity-alert',options.dbOptions||{}),
    car:()=>actor==='Рустам'?readCarState(options.carOptions||{}):null
  };
  const all=await Promise.all(Object.entries(jobs).map(async([name,fn])=>{
    try{return [name,await fn()]}catch(error){console.warn('RUDI_RECOMMENDATIONS_SOURCE_UNAVAILABLE',name,String(error?.message||error));return[name,null]}
  }));
  const sources=Object.fromEntries(all);
  return {finance:sources.finance,taskCount:sources.tasks,
    humidity:sources.humidity?{value:sources.humidity.lastHumidity,updatedAt:sources.humidity.updatedAt}:null,
    car:sources.car};
}
async function handleRecommendations(req,res,options={}){
  res.setHeader?.('Cache-Control','private, no-store, max-age=0');
  if(req.method!=='POST')return res.status(405).json({ok:false,error:'method-not-allowed'});
  const body=req.body && typeof req.body==='object' && !Array.isArray(req.body)?req.body:{};
  let actor;
  try{({actor}=authorizeRequest(req,body.initData,{env:options.env||process.env}));}
  catch(error){return res.status(statusForError(error)).json({ok:false,error:'unauthorized'});}
  const operation=String(body.operation||'list');
  try{
    if(operation==='set-rules'){
      if(actor!=='Рустам')return res.status(403).json({ok:false,error:'owner-only'});
      if(!body.rules||typeof body.rules!=='object'||Array.isArray(body.rules))return res.status(400).json({ok:false,error:'invalid-rules'});
      const rules=rulesFrom(body.rules);
      await writeAppState('Рустам',RULES_KEY,rules,options.dbOptions||{});
      return res.status(200).json({ok:true,rules});
    }
    if(operation==='hide'||operation==='snooze'){
      const id=String(body.id||'').trim();
      if(!/^[a-z0-9:_-]{1,110}$/i.test(id))return res.status(400).json({ok:false,error:'invalid-id'});
      const previous=feedbackFrom(await readAppState(actor,FEEDBACK_KEY,options.dbOptions||{}));
      const updated={
        ...previous.entries,
        [id]:{action:operation,until:operation==='snooze'?Date.now()+3*86400000:0}
      };
      const bounded=feedbackFrom({entries:updated});
      await writeAppState(actor,FEEDBACK_KEY,bounded,options.dbOptions||{});
      return res.status(200).json({ok:true});
    }
    if(operation!=='list')return res.status(400).json({ok:false,error:'unknown-operation'});
    const [rulesStored,feedback,sources]=await Promise.all([
      readAppState('Рустам',RULES_KEY,options.dbOptions||{}).catch(()=>null),
      readAppState(actor,FEEDBACK_KEY,options.dbOptions||{}).catch(()=>null),
      getSources(actor,options)
    ]);
    const rules=rulesFrom(rulesStored);
    const recommendations=buildRecommendations({...sources,rules,now:new Date(options.now||Date.now())});
    return res.status(200).json({ok:true,recommendations:visibleRecommendations(recommendations,feedback,Number(options.now||Date.now()),rules.maxItems)});
  }catch(error){
    console.error('RUDI_RECOMMENDATIONS_ERROR',String(error?.message||error));
    return res.status(503).json({ok:false,error:'recommendations-unavailable'});
  }
}
module.exports={DEFAULT_RULES,rulesFrom,moscowDate,nextService,buildRecommendations,feedbackFrom,visibleRecommendations,handleRecommendations};
