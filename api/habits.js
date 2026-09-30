const {authorizeRequest,statusForError}=require('./rudi-request-auth.cjs');
const {
  moscowDateKey,moscowHour,readHabits,viewHabits,ensureHabitDay,addHabit,removeHabit,archiveHabit,setHabitStatus,setHabitsCollapsed
}=require('./habit-tracker-store.cjs');
const {reconcileHabitScore,clearHabitScore,reconcileTodayHabitScores,finalizeOutstandingHabitDays}=require('./habit-rules.cjs');

function statusFor(code,error){
  const auth=statusForError(error);if(auth!==500)return auth;
  if(code==='habit-not-found')return 404;
  if(code==='habit-duplicate')return 409;
  if(['habit-name-required','habit-purpose-required','habit-id-required','habit-limit','habit-operation-invalid','habit-status-invalid','habit-done-too-early','habits-actor-invalid','habit-date-future'].includes(code))return 400;
  if(code==='rudi-auth-db-unavailable')return 503;
  return 500;
}
async function handler(req,res){
  if(req.method!=='POST')return res.status(405).json({ok:false,error:'method-not-allowed'});
  try{
    const body=req.body&&typeof req.body==='object'&&!Array.isArray(req.body)?req.body:{};
    const {actor}=authorizeRequest(req,body.initData);
    const operation=String(body.operation||'list').trim(),now=Date.now(),today=moscowDateKey(now);
    const requestedDate=String(body.date||'').trim()||today;
    try{await finalizeOutstandingHabitDays(actor,{now})}catch(error){console.error('RUDI_HABIT_SELF_HEAL_FINALIZE_ERROR',actor,String(error?.message||error))}
    let state,score=null,scoreDelta=0;

    if(operation==='list'){
      state=requestedDate===today?await ensureHabitDay(actor,today,{now}):await readHabits(actor,{now});
      if(requestedDate===today){
        const sync=await reconcileTodayHabitScores(actor,state,{now});score=sync.score;scoreDelta=sync.deltaPoints;
        state=await readHabits(actor,{now});
      }
    }else if(operation==='add'){
      state=await addHabit(actor,body.name,{now,purpose:body.purpose});
      state=await ensureHabitDay(actor,today,{now});
    }else if(operation==='remove'||operation==='archive'){
      state=await ensureHabitDay(actor,today,{now});
      const id=String(body.id||''),habit=state.habits.find(row=>row.id===id);if(!habit)throw new Error('habit-not-found');
      const cleared=await clearHabitScore(actor,habit,today,{now});score=cleared.score;scoreDelta=cleared.deltaPoints;
      state=operation==='archive'?await archiveHabit(actor,id,{now}):await removeHabit(actor,id,{now});
      const sync=await reconcileTodayHabitScores(actor,state,{now});if(sync.score)score=sync.score;scoreDelta+=sync.deltaPoints;
      state=await readHabits(actor,{now});
    }else if(operation==='status'){
      const date=String(body.date||'').trim()||today;
      if(date===today&&String(body.status||'')==='done'&&moscowHour(now)<20)throw new Error('habit-done-too-early');
      state=date===today?await ensureHabitDay(actor,today,{now}):await readHabits(actor,{now});
      const habit=state.habits.find(row=>row.id===String(body.id||''));if(!habit)throw new Error('habit-not-found');
      state=await setHabitStatus(actor,body.id,body.status,{date,now});
      if(date===today){
        const bonusEligible=(state.bonusIdsByDate?.[today]||[]).includes(habit.id);
        const sync=await reconcileHabitScore(actor,habit,today,String(body.status||''),bonusEligible,{now});
        score=sync.score;scoreDelta=sync.deltaPoints;
      }
    }else if(operation==='collapse')state=await setHabitsCollapsed(actor,body.collapsed,{now});
    else throw new Error('habit-operation-invalid');

    return res.status(200).json({ok:true,actor,...viewHabits(state,{date:requestedDate,now}),score,scoreDelta});
  }catch(error){
    const code=String(error?.message||error),status=statusFor(code,error);
    if(status===500)console.error('RUDI_HABITS_ERROR',code,error?.stack||'');
    return res.status(status).json({ok:false,error:code});
  }
}
module.exports=handler;
module.exports.handler=handler;
