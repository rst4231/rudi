const {authorizeRequest,statusForError}=require('./rudi-request-auth.cjs');
const {readFinanceState,viewState}=require('./finance-store.cjs');
const {readHabits,viewHabits,moscowDateKey}=require('./habit-tracker-store.cjs');
const {readFastingState}=require('./fasting-store.cjs');
const {readMoodHistory}=require('./daily-mood-store.cjs');

const DATE_RE=/^\d{4}-\d{2}-\d{2}$/;
const moscowDayFormatter=new Intl.DateTimeFormat('en-CA',{
  timeZone:'Europe/Moscow',year:'numeric',month:'2-digit',day:'2-digit'
});
function validPastDay(value,now=Date.now()){
  const date=String(value||'');
  if(!DATE_RE.test(date))return false;
  const instant=new Date(date+'T12:00:00Z');
  return Number.isFinite(instant.getTime())&&instant.toISOString().slice(0,10)===date&&date<moscowDateKey(now);
}
function dateInMoscow(value){
  const timestamp=Date.parse(String(value||''));
  return Number.isFinite(timestamp)?moscowDayFormatter.format(new Date(timestamp)):'';
}
function summarizeExpenses(state,actor,date){
  const view=viewState(state,actor);
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
        occurredAt:String(row.occurredAt||row.createdAt||''),
      };
    }).filter(row=>row.amountRub>0)
    .sort((a,b)=>b.occurredAt.localeCompare(a.occurredAt));
  return{available:true,totalRub:Math.round(items.reduce((sum,row)=>sum+row.amountRub,0)*100)/100,items};
}
function summarizeHabits(state,date,now=Date.now()){
  const view=viewHabits(state,{date,now});
  return{available:true,habits:(view.habits||[]).map(habit=>({
    name:habit.name,emoji:habit.emoji||'',status:view.statuses?.[habit.id]||'pending'
  }))};
}
function summarizeFasting(state,date,now=Date.now()){
  // Moscow is UTC+3 all year. Check overlaps, not just the date a session ended.
  const start=Date.parse(date+'T00:00:00+03:00'),end=start+86400000;
  const sessions=[...(state.history||[]),...(state.active?[{...state.active,endedAt:null}]:[])]
    .filter(row=>{
      const a=Date.parse(String(row.startedAt||''));
      const b=row.endedAt?Date.parse(String(row.endedAt)):now;
      return Number.isFinite(a)&&Number.isFinite(b)&&a<end&&b>start;
    }).map(row=>({
      startedAt:row.startedAt,
      endedAt:row.endedAt||null,
      durationMinutes:row.endedAt?Number(row.durationMinutes||0):null,
      goalHours:Number(row.goalHours)||0
    }));
  return{available:true,sessions};
}
function summarizeMood(history,date){
  const row=(Array.isArray(history)?history:[]).find(item=>item.date===date);
  return{available:true,averageMood:row?.averageMood||row?.mood||'',sampleCount:Number(row?.sampleCount||0)};
}
function resultOf(settled,format){
  if(settled.status!=='fulfilled')return{available:false};
  try{return format(settled.value)}catch{return{available:false}}
}
async function handler(req,res){
  if(req.method!=='POST')return res.status(405).json({ok:false,error:'method-not-allowed'});
  try{
    const body=req.body&&typeof req.body==='object'&&!Array.isArray(req.body)?req.body:{};
    const {actor}=authorizeRequest(req,body.initData);
    const now=Date.now(),date=String(body.date||'');
    if(!validPastDay(date,now))return res.status(400).json({ok:false,error:'calendar-summary-date-invalid'});
    const [finance,habits,fasting,mood]=await Promise.allSettled([
      readFinanceState(),readHabits(actor,{now}),readFastingState(actor),readMoodHistory(actor,{now})
    ]);
    const result={
      ok:true,date,
      expenses:resultOf(finance,state=>summarizeExpenses(state,actor,date)),
      habits:resultOf(habits,state=>summarizeHabits(state,date,now)),
      fasting:resultOf(fasting,state=>summarizeFasting(state,date,now)),
      mood:resultOf(mood,history=>summarizeMood(history,date))
    };
    result.partial=[result.expenses,result.habits,result.fasting,result.mood].some(item=>!item.available);
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
module.exports.dateInMoscow=dateInMoscow;
module.exports.summarizeExpenses=summarizeExpenses;
module.exports.summarizeHabits=summarizeHabits;
module.exports.summarizeFasting=summarizeFasting;
module.exports.summarizeMood=summarizeMood;
