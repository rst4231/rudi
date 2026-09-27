const {
  MAX_DAYS,SCORING_START_DATE,moscowDateKey,shiftDateKey,habitStatus,viewHabits,readHabits,ensureHabitDay,setHabitStatus,markHabitDayFinalized
}=require('./habit-tracker-store.cjs');
const {
  readScoreState,awardScore,penalizeScore,reverseScoreByDedupeKey,reversePenaltyByDedupeKey,scoreView
}=require('./score-store.cjs');

const HABIT_REWARD_UNITS=0.5;
const HABIT_PENALTY_UNITS=1;

function rewardKey(actor,date,id){return 'score:habit:reward:'+actor+':'+date+':'+id}
function penaltyKey(actor,date,id){return 'score:habit:penalty:'+actor+':'+date+':'+id}
function cleanName(value){return String(value||'Привычка').replace(/\s+/g,' ').trim().slice(0,80)}

async function reconcileHabitScore(actor,habit,date,status,bonusEligible,options={}){
  const today=moscowDateKey(options.now||Date.now());
  if(date!==today&&!options.allowPastPenalty)return{score:null,deltaPoints:0,changed:false};
  const id=String(habit?.id||''),name=cleanName(habit?.name);
  const rk=rewardKey(actor,date,id),pk=penaltyKey(actor,date,id);
  const before=scoreView(await readScoreState(options),options),beforeBalance=Number(before.balances?.[actor]||0);
  let latest=null;
  if(!bonusEligible||status==='pending'){
    latest=(await reverseScoreByDedupeKey(rk,{clearDedupe:true,skipStreak:true,label:'Отмена привычки',detail:'Отменено начисление: '+name,icon:'↩️'},options)).state;
    latest=(await reversePenaltyByDedupeKey(pk,{clearDedupe:true,label:'Отмена штрафа',detail:'Отменён штраф: '+name,icon:'↩️'},options)).state;
  }else if(status==='done'){
    latest=(await reversePenaltyByDedupeKey(pk,{clearDedupe:true,label:'Отмена штрафа',detail:'Статус изменён на «Выполнено»: '+name,icon:'↩️'},options)).state;
    latest=(await awardScore(actor,HABIT_REWARD_UNITS,{
      label:'Привычка',detail:'Выполнено: '+name,icon:'🟢',dedupeKey:rk,affectStreak:false
    },options)).state;
  }else if(status==='notdone'){
    latest=(await reverseScoreByDedupeKey(rk,{clearDedupe:true,skipStreak:true,label:'Отмена привычки',detail:'Статус изменён на «Не выполнено»: '+name,icon:'↩️'},options)).state;
    latest=(await penalizeScore(actor,HABIT_PENALTY_UNITS,{
      label:'Привычка',detail:'Не выполнено: '+name,icon:'🔴',dedupeKey:pk
    },options)).state;
  }
  const after=scoreView(latest||await readScoreState(options),options),afterBalance=Number(after.balances?.[actor]||0);
  return{score:after,deltaPoints:Number((afterBalance-beforeBalance).toFixed(2)),changed:Math.abs(afterBalance-beforeBalance)>0.0001};
}
async function clearHabitScore(actor,habitOrId,date,options={}){
  const today=moscowDateKey(options.now||Date.now());if(date!==today)return{score:null,deltaPoints:0,changed:false};
  const habit=habitOrId&&typeof habitOrId==='object'?habitOrId:{id:String(habitOrId||''),name:'Удалённая привычка'};
  return reconcileHabitScore(actor,habit,date,'pending',false,options);
}
async function reconcileTodayHabitScores(actor,state,options={}){
  const today=moscowDateKey(options.now||Date.now());
  const prepared=Object.prototype.hasOwnProperty.call(state.bonusIdsByDate||{},today)?state:await ensureHabitDay(actor,today,options);
  const bonusIds=prepared.bonusIdsByDate?.[today]||[],byId=new Map(prepared.habits.map(row=>[row.id,row]));
  let result={score:null,deltaPoints:0,changed:false};
  for(const id of bonusIds){
    const habit=byId.get(id);
    if(!habit){const cleared=await clearHabitScore(actor,id,today,options);if(cleared.score)result.score=cleared.score;result.deltaPoints+=cleared.deltaPoints;continue}
    const one=await reconcileHabitScore(actor,habit,today,habitStatus(prepared,today,id),true,options);
    if(one.score)result.score=one.score;result.deltaPoints+=one.deltaPoints;
  }
  return result;
}
async function finalizeHabitDay(actor,date,options={}){
  const target=String(date||'').trim(),today=moscowDateKey(options.now||Date.now());
  if(!target||target>=today)return{finalized:false,penalized:0};
  let state=await ensureHabitDay(actor,target,options);
  if(state.finalizedDates?.[target])return{finalized:false,already:true,penalized:0};
  const bonusIds=state.bonusIdsByDate?.[target]||[],byId=new Map(state.habits.map(row=>[row.id,row]));
  let penalized=0;
  for(const id of bonusIds){
    const habit=byId.get(id);if(!habit)continue;
    const status=habitStatus(state,target,id);
    if(status==='pending'){
      const one=await reconcileHabitScore(actor,habit,target,'notdone',true,{...options,allowPastPenalty:true});
      if(one.deltaPoints<0)penalized+=Math.abs(one.deltaPoints);
      state=await setHabitStatus(actor,id,'notdone',{...options,date:target});
      continue;
    }
    if(status==='notdone'){
      const updatedAt=String(state.statusUpdatedAt?.[target]?.[id]||'');
      const updatedMs=Date.parse(updatedAt),updatedKey=Number.isFinite(updatedMs)?moscowDateKey(updatedMs):'';
      if(updatedKey===target){
        const one=await reconcileHabitScore(actor,habit,target,'notdone',true,{...options,allowPastPenalty:true});
        if(one.deltaPoints<0)penalized+=Math.abs(one.deltaPoints);
      }
    }
  }
  await markHabitDayFinalized(actor,target,options);
  return{finalized:true,penalized:Number(penalized.toFixed(2)),date:target};
}
async function finalizeOutstandingHabitDays(actor,options={}){
  const today=moscowDateKey(options.now||Date.now()),last=shiftDateKey(today,-1);
  const state=await readHabits(actor,options),start=String(state.scoringStartedDate||SCORING_START_DATE);
  if(!start||start>last)return{actor,days:0,penalized:0,results:[]};
  const results=[];let key=start,guard=0,total=0;
  while(key&&key<=last&&guard<MAX_DAYS){
    const result=await finalizeHabitDay(actor,key,options);
    if(result?.penalized)total+=Number(result.penalized||0);
    results.push(result);key=shiftDateKey(key,1);guard+=1;
  }
  return{actor,days:results.filter(row=>row?.finalized).length,penalized:Number(total.toFixed(2)),results};
}
async function finalizeYesterdayForAll(options={}){
  const yesterday=shiftDateKey(moscowDateKey(options.now||Date.now()),-1),results={};
  for(const actor of ['Рустам','Диана'])results[actor]=await finalizeHabitDay(actor,yesterday,options);
  return{date:yesterday,results};
}
async function finalizeOutstandingForAll(options={}){
  const results={};for(const actor of ['Рустам','Диана'])results[actor]=await finalizeOutstandingHabitDays(actor,options);
  return{date:moscowDateKey(options.now||Date.now()),results};
}

module.exports={
  HABIT_REWARD_UNITS,HABIT_PENALTY_UNITS,rewardKey,penaltyKey,reconcileHabitScore,clearHabitScore,
  reconcileTodayHabitScores,finalizeHabitDay,finalizeOutstandingHabitDays,finalizeYesterdayForAll,finalizeOutstandingForAll
};
