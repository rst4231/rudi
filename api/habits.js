const {authorizeRequest,statusForError}=require('./partner-message.js');
const {
  moscowDateKey,readHabits,viewHabits,ensureHabitDay,addHabit,removeHabit,setHabitStatus,setHabitsCollapsed
}=require('./habit-tracker-store.cjs');
const {reconcileHabitScore,clearHabitScore,reconcileTodayHabitScores}=require('./habit-rules.cjs');

function statusFor(code,error){
  const auth=statusForError(error);if(auth!==500)return auth;
  if(code==='habit-not-found')return 404;
  if(code==='habit-duplicate')return 409;
  if(['habit-name-required','habit-id-required','habit-limit','habit-operation-invalid','habit-status-invalid','habits-actor-invalid','habit-date-future'].includes(code))return 400;
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
    let state,score=null,scoreDelta=0;

    if(operation==='list'){
      state=requestedDate===today?await ensureHabitDay(actor,today,{now}):await readHabits(actor,{now});
      if(requestedDate===today){
        const sync=await reconcileTodayHabitScores(actor,state,{now});score=sync.score;scoreDelta=sync.deltaPoints;
        state=await readHabits(actor,{now});
      }
    }else if(operation==='add'){
      state=await addHabit(actor,body.name,{now});
      state=await ensureHabitDay(actor,today,{now});
    }else if(operation==='remove'){
      state=await ensureHabitDay(actor,today,{now});
      const id=String(body.id||''),date=String(body.date||'').trim()||today;
      if(date===today){const cleared=await clearHabitScore(actor,id,today,{now});score=cleared.score;scoreDelta=cleared.deltaPoints}
      state=await removeHabit(actor,id,{now});
    }else if(operation==='status'){
      const date=String(body.date||'').trim()||today;
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
