const {isCronRequestAuthorized}=require('./cron-auth.cjs');
const {readRecipients}=require('./partner-notification-store.cjs');
const {telegramSendMessage,escapeTelegramHtml}=require('./telegram-notifications.cjs');
const {moscowDateKey,ensureHabitDay,viewHabits,markHabitReminderSent}=require('./habit-tracker-store.cjs');

async function handler(req,res){
  if(!isCronRequestAuthorized(req))return res.status(401).json({ok:false,error:'unauthorized-cron'});
  const now=Date.now(),today=moscowDateKey(now),recipients=await readRecipients().catch(()=>null),results={};
  for(const actor of ['Рустам','Диана']){
    try{
      let state=await ensureHabitDay(actor,today,{now});
      if(state.remindedDates?.[today]){results[actor]={skipped:'already-processed'};continue}
      const view=viewHabits(state,{date:today,now});
      const pending=view.habits.filter(habit=>view.statuses?.[habit.id]==='pending');
      const bonusSet=new Set(view.bonusIds||[]);
      const bonusPending=pending.filter(habit=>bonusSet.has(habit.id));
      const chatId=Number(recipients?.[actor]);
      if(pending.length&&Number.isInteger(chatId)&&chatId>0){
        const lines=['🌱 <b>Привычки на сегодня</b>','','Осталось отметить: <b>'+pending.length+'</b>.',...pending.slice(0,6).map(habit=>'• '+escapeTelegramHtml(habit.name))];
        if(pending.length>6)lines.push('• и ещё '+(pending.length-6));
        if(bonusPending.length)lines.push('','⚠️ Если до конца дня не отметить '+bonusPending.length+' бонусн'+(bonusPending.length===1?'ую привычку':'ые привычки')+', за каждую неотмеченную будет <b>−0,1 ⭐</b>.');
        await telegramSendMessage(chatId,lines.join('\n'),{buttonText:'Открыть RUDI',tab:'home'});
        await markHabitReminderSent(actor,today,{now});
        results[actor]={sent:true,pending:pending.length,bonusPending:bonusPending.length};
      }else if(!pending.length){
        await markHabitReminderSent(actor,today,{now});
        results[actor]={sent:false,pending:0,bonusPending:0};
      }else results[actor]={sent:false,pending:pending.length,bonusPending:bonusPending.length,error:'recipient-unavailable'};
    }catch(error){results[actor]={error:String(error?.message||error)};console.error('RUDI_HABIT_REMINDER_ERROR',actor,String(error?.message||error))}
  }
  return res.status(200).json({ok:true,date:today,results});
}
module.exports=handler;
