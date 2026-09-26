const {isCronRequestAuthorized}=require('./cron-auth.cjs');
const {readRecipients}=require('./partner-notification-store.cjs');
const {telegramSendMessage,escapeTelegramHtml}=require('./telegram-notifications.cjs');
const {readSupplements,claimSupplementNotification,releaseSupplementNotification,moscowDateKey}=require('./supplements-store.cjs');

function moscowClock(now=Date.now()){
  const parts=new Intl.DateTimeFormat('en-US',{timeZone:'Europe/Moscow',hour12:false,hour:'2-digit',minute:'2-digit'}).formatToParts(new Date(now));
  const v=Object.fromEntries(parts.map(p=>[p.type,p.value]));
  return String(v.hour).padStart(2,'0')+':'+String(v.minute).padStart(2,'0');
}
function dateToUtcNoon(dateKey){
  if(!/^\d{4}-\d{2}-\d{2}$/.test(String(dateKey||'')))return null;
  const [y,m,d]=dateKey.split('-').map(Number);return Date.UTC(y,m-1,d,12,0,0);
}
function addDays(dateKey,days){
  const ms=dateToUtcNoon(dateKey);if(ms===null)return'';
  const d=new Date(ms+Number(days||0)*86400000);
  return d.toISOString().slice(0,10);
}
function daysUntil(dateKey,today){
  const a=dateToUtcNoon(dateKey),b=dateToUtcNoon(today);if(a===null||b===null)return null;
  return Math.round((a-b)/86400000);
}
async function sendClaimed(actor,item,key,text,buttonText,query,options={}){
  const claimed=await claimSupplementNotification(actor,item.id,key,options);
  if(!claimed.claimed)return false;
  try{
    await telegramSendMessage(options.chatId,text,{...options,buttonText,tab:'home',query});
    return true;
  }catch(error){
    await releaseSupplementNotification(actor,item.id,key,options).catch(()=>{});
    throw error;
  }
}
async function runSupplementReminders(options={}){
  const now=options.now||Date.now(),today=moscowDateKey(now),clock=moscowClock(now),recipients=options.recipients||await readRecipients(options);
  const result={today,clock,sent:0,skipped:0,errors:[]};
  for(const actor of ['Рустам','Диана']){
    const chatId=Number(recipients?.[actor]);if(!Number.isInteger(chatId)||chatId<=0){result.skipped++;continue}
    const state=await readSupplements(actor,options);
    for(const item of state.items){
      try{
        if(item.status==='active'&&item.schedule?.reminderEnabled&&item.schedule?.time&&clock>=item.schedule.time&&!item.intakes.some(row=>row.date===today)){
          const key='dose:'+today+':'+item.schedule.time;
          const detail=[item.schedule.dosage,item.schedule.food==='before'?'до еды':item.schedule.food==='with'?'во время еды':item.schedule.food==='after'?'после еды':''].filter(Boolean).join(' · ');
          const text='⏰ <b>Пора принять '+escapeTelegramHtml(item.name)+'</b>'+ (detail?'\n'+escapeTelegramHtml(detail):'');
          if(await sendClaimed(actor,item,key,text,'✅ Принял',{profile:'supplements',take:item.id},{...options,chatId}))result.sent++;
        }
        const expDays=daysUntil(item.expirationDate,today);
        if(item.status!=='finished'&&item.expirationDate&&[7,1,0].includes(expDays)){
          const key='expiry:'+item.expirationDate+':'+expDays;
          const label=expDays===0?'сегодня истекает срок годности':expDays===1?'срок годности истекает завтра':'до окончания срока годности 7 дней';
          const text='📦 <b>'+escapeTelegramHtml(item.name)+'</b> — '+label+'.';
          if(await sendClaimed(actor,item,key,text,'Открыть RUDI',{profile:'supplements'},{...options,chatId}))result.sent++;
        }
        if(item.status!=='finished'&&item.course?.startDate&&item.course?.durationDays>0){
          const end=addDays(item.course.startDate,item.course.durationDays-1),left=daysUntil(end,today);
          if([3,0].includes(left)){
            const key='course:'+end+':'+left;
            const label=left===0?'курс заканчивается сегодня':'до конца курса 3 дня';
            const text='📅 <b>'+escapeTelegramHtml(item.name)+'</b> — '+label+'.';
            if(await sendClaimed(actor,item,key,text,'Открыть RUDI',{profile:'supplements'},{...options,chatId}))result.sent++;
          }
        }
      }catch(error){result.errors.push({actor,item:item.id,error:String(error?.message||error)});}
    }
  }
  return result;
}
async function handler(req,res){
  if(!isCronRequestAuthorized(req)){console.error('RUDI_SUPPLEMENT_CRON_UNAUTHORIZED');return res.status(401).json({ok:false,error:'unauthorized-cron'})}
  try{const result=await runSupplementReminders();console.log('RUDI_SUPPLEMENT_REMINDER_RESULT',JSON.stringify(result));return res.status(200).json({ok:true,...result})}
  catch(error){console.error('RUDI_SUPPLEMENT_REMINDER_ERROR',String(error?.message||error));return res.status(500).json({ok:false,error:'supplement-reminder-failed'})}
}
module.exports=handler;
module.exports.runSupplementReminders=runSupplementReminders;
module.exports.moscowClock=moscowClock;
module.exports.daysUntil=daysUntil;
module.exports.addDays=addDays;