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
        const pendingWord=(count)=>{const mod10=count%10,mod100=count%100;return mod10===1&&mod100!==11?'привычку':mod10>=2&&mod10<=4&&(mod100<12||mod100>14)?'привычки':'привычек'};const lines=['🌱 <b>Привычки на сегодня</b>','','Осталось отметить <b>'+pending.length+' '+pendingWord(pending.length)+'</b>.',...pending.slice(0,6).map(habit=>'• '+escapeTelegramHtml(habit.name))];
        if(pending.length>6)lines.push('• и ещё '+(pending.length-6));
        if(bonusPending.length)lines.push('','⚠️ Если до конца дня оставить без отметки '+bonusPending.length+' '+(bonusPending.length%10===1&&bonusPending.length%100!==11?'бонусную привычку':bonusPending.length%10>=2&&bonusPending.length%10<=4&&(bonusPending.length%100<12||bonusPending.length%100>14)?'бонусные привычки':'бонусных привычек')+', за каждую снимется <b>−0,1 ⭐</b>.');
        await telegramSendMessage(chatId,lines.join('\n'),{buttonText:'Открыть RUDI',tab:'home'});
        await markHabitReminderSent(actor,today,{now});
        results[actor]={sent:true,pending:pending.length,bonusPending:bonusPending.length};
      }else if(!pending.length){
        await markHabitReminderSent(actor,today,{now});
        results[actor]={sent:false,pending:0,bonusPending:0};
      }else results[actor]={sent:false,pending:pending.length,bonusPending:bonusPending.length,error:'recipient-unavailable'};
    }catch(error){results[actor]={error:String(error?.message||error)};console.error('RUDI_HABIT_REMINDER_ERROR',actor,String(error?.message||error))}
  }
  console.log('RUDI_HABIT_REMINDER_RESULT',JSON.stringify({date:today,schedule:String(req.headers?.['x-vercel-cron-schedule']||''),results}));
  return res.status(200).json({ok:true,date:today,results});
}
module.exports=handler;
