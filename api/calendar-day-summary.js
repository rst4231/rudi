const {authorizeRequest,statusForError}=require('./rudi-request-auth.cjs');
const {readFinanceState,viewState}=require('./finance-store.cjs');
const {readHabits,viewHabits,moscowDateKey}=require('./habit-tracker-store.cjs');
const {readFastingState}=require('./fasting-store.cjs');
const {readMoodHistory}=require('./daily-mood-store.cjs');
const {readSupplements}=require('./supplements-store.cjs');

// One authenticated read of each data source per month; no requests on every date tap.
const DATE_RE=/^\d{4}-\d{2}-\d{2}$/;
const MONTH_RE=/^\d{4}-(0[1-9]|1[0-2])$/;
const CACHE_TTL_MS=60*1000;
const MAX_CACHED=12;
const summaryCache=new Map();
const summaryInflight=new Map();
const moscowDayFormatter=new Intl.DateTimeFormat('en-CA',{
  timeZone:'Europe/Moscow',year:'numeric',month:'2-digit',day:'2-digit'
});
function validPastDay(value,now=Date.now()){
  const date=String(value||'');
  if(!DATE_RE.test(date))return false;
  const instant=new Date(date+'T12:00:00Z');
  return Number.isFinite(instant.getTime())&&instant.toISOString().slice(0,10)===date&&date<moscowDateKey(now);
}
function validMonth(value,now=Date.now()){
  const month=String(value||'');
  return MONTH_RE.test(month)&&month<=moscowDateKey(now).slice(0,7);
}
function dateInMoscow(value){
  const timestamp=Date.parse(String(value||''));
  return Number.isFinite(timestamp)?moscowDayFormatter.format(new Date(timestamp)):'';
}
function summarizeExpenses(view,date){
  const cats=new Map([...(view.categories||[]),...(view.archivedCategories||[])].map(row=>[row.id,row]));
  const items=(view.personalExpenses||[])
    .filter(row=>!row.manualAdjustment&&dateInMoscow(row.occurredAt||row.createdAt)===date)
    .map(row=>{
      const amount=Number(row.rubAmount??row.amount);
      return{
        category:cats.get(row.categoryId)?.name||'Без категории',
        categoryIcon:cats.get(row.categoryId)?.icon||'',
        label:String(row.label||'').slice(0,32),
        note:String(row.note||'').slice(0,120),
        amountRub:Number.isFinite(amount)?Math.round(amount*100)/100:0,
        occurredAt:String(row.occurredAt||row.createdAt||'')
      };
    }).filter(row=>row.amountRub>0).sort((a,b)=>b.occurredAt.localeCompare(a.occurredAt));
  return{available:true,totalRub:Math.round(items.reduce((sum,row)=>sum+row.amountRub,0)*100)/100,items};
}
function summarizeHabits(state,date,now=Date.now()){
  const view=viewHabits(state,{date,now});
  return{available:true,habits:(view.habits||[]).map(habit=>({
    name:habit.name,emoji:habit.emoji||'',status:view.statuses?.[habit.id]||'pending'
  }))};
}
function summarizeFasting(state,date,now=Date.now()){
  // Moscow is UTC+3 throughout the year. Account for sessions crossing midnight.
  const start=Date.parse(date+'T00:00:00+03:00'),end=start+86400000;
  const sessions=[...(state.history||[]),...(state.active?[{...state.active,endedAt:null}]:[])]
    .filter(row=>{
      const a=Date.parse(String(row.startedAt||''));
      const b=row.endedAt?Date.parse(String(row.endedAt)):now;
      return Number.isFinite(a)&&Number.isFinite(b)&&a<end&&b>start;
    }).map(row=>({
      startedAt:row.startedAt,endedAt:row.endedAt||null,
      durationMinutes:row.endedAt?Number(row.durationMinutes||0):null,
      goalHours:Number(row.goalHours)||0
    }));
  return{available:true,sessions};
}
function summarizeMood(history,date){
  const row=(Array.isArray(history)?history:[]).find(item=>item.date===date);
  return{available:true,averageMood:row?.averageMood||row?.mood||'',sampleCount:Number(row?.sampleCount||0)};
}
function summarizeSupplements(state,date){
  const items=(state.items||[]).flatMap(item=>(item.intakes||[])
    .filter(intake=>intake.date===date&&Number.isFinite(Date.parse(intake.at)))
    .map(intake=>({name:String(item.name||'БАД').slice(0,120),at:intake.at}))
  ).sort((a,b)=>String(a.at).localeCompare(String(b.at)));
  return{available:true,items};
}
function resultOf(settled,format){
  if(settled.status!=='fulfilled')return{available:false};
  try{return format(settled.value)}catch{return{available:false}}
}
async function buildMonth(actor,month,now){
  // Exactly five source reads for the entire selected month, done concurrently.
  const [finance,habits,fasting,mood,supplements]=await Promise.allSettled([
    readFinanceState(),readHabits(actor,{now}),readFastingState(actor),readMoodHistory(actor,{now}),readSupplements(actor)
  ]);
  const financeView=finance.status==='fulfilled'?viewState(finance.value,actor):null;
  const days={};
  const [year,monthNumber]=month.split('-').map(Number);
  const maxDay=new Date(Date.UTC(year,monthNumber,0)).getUTCDate();
  for(let day=1;day<=maxDay;day++){
    const date=month+'-'+String(day).padStart(2,'0');
    if(!validPastDay(date,now))continue;
    const result={
      expenses:financeView?resultOf({status:'fulfilled',value:financeView},view=>summarizeExpenses(view,date)):{available:false},
      habits:resultOf(habits,state=>summarizeHabits(state,date,now)),
      fasting:resultOf(fasting,state=>summarizeFasting(state,date,now)),
      mood:resultOf(mood,history=>summarizeMood(history,date)),
      supplements:resultOf(supplements,state=>summarizeSupplements(state,date))
    };
    result.partial=Object.values(result).some(value=>value?.available===false);
    days[date]=result;
  }
  return{ok:true,month,days};
}
async function cachedMonth(actor,month,now){
  const key=actor+':'+month,cached=summaryCache.get(key);
  if(cached&&now-cached.at<CACHE_TTL_MS)return cached.data;
  if(summaryInflight.has(key))return summaryInflight.get(key);
  const pending=buildMonth(actor,month,now).then(data=>{
    // Avoid caching transient partial failures; retry them on next request.
    if(!Object.values(data.days).some(day=>day.partial)){
      summaryCache.set(key,{at:Date.now(),data});
      while(summaryCache.size>MAX_CACHED)summaryCache.delete(summaryCache.keys().next().value);
    }
    return data;
  }).finally(()=>summaryInflight.delete(key));
  summaryInflight.set(key,pending);
  return pending;
}
async function handler(req,res){
  if(req.method!=='POST')return res.status(405).json({ok:false,error:'method-not-allowed'});
  try{
    const body=req.body&&typeof req.body==='object'&&!Array.isArray(req.body)?req.body:{};
    const {actor}=authorizeRequest(req,body.initData);
    const now=Date.now(),month=String(body.month||'');
    if(!validMonth(month,now))return res.status(400).json({ok:false,error:'calendar-summary-month-invalid'});
    const result=await cachedMonth(actor,month,now);
    res.setHeader('Cache-Control','private, no-store');
    return res.status(200).json(result);
  }catch(error){
    const code=String(error?.message||error),status=statusForError(error);
    if(status===500)console.error('RUDI_CALENDAR_DAY_SUMMARY_ERROR',code);
    return res.status(status).json({ok:false,error:code});
  }
}
module.exports=handler;
module.exports.handler=handler;
module.exports.validPastDay=validPastDay;
module.exports.validMonth=validMonth;
module.exports.dateInMoscow=dateInMoscow;
module.exports.summarizeExpenses=summarizeExpenses;
module.exports.summarizeHabits=summarizeHabits;
module.exports.summarizeFasting=summarizeFasting;
module.exports.summarizeMood=summarizeMood;
module.exports.summarizeSupplements=summarizeSupplements;
module.exports.buildMonth=buildMonth;
module.exports.resetCacheForTests=()=>{summaryCache.clear();summaryInflight.clear()};
