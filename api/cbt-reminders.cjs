'use strict';
const core=require('../public/cbt-core.js');
const {readAppState}=require('./rudi-auth-db.cjs');

// Only the presence and timestamp of an observation leave the private CBT store.
function pendingCbtReminder(state,now=Date.now()){
 const at=new Date(now).toISOString(),run=core.active(core.refresh(state,at));
 if(!run)return null;
 const timeZone=run.calendar?.timeZone||'Europe/Moscow',today=core.dayKey(at,timeZone);
 const wroteToday=Object.values(run.days||{}).some(row=>core.entries(row).some(record=>{
  if(!core.hasAnswers(record.answers))return false;
  return [record.answerUpdatedAt,record.savedAt,record.startedAt].some(stamp=>stamp&&Number.isFinite(Date.parse(stamp))&&core.dayKey(stamp,timeZone)===today);
 }));
 return wroteToday?null:{day:core.nextDay(run,at)};
}
async function loadPendingCbtReminder(actor,options={}){
 if(!['Рустам','Диана'].includes(actor))return null;
 try{const state=await (options.readCbtStateImpl||readAppState)(actor,'cbt-program-v1',options.dbOptions||{});return pendingCbtReminder(state,options.now||Date.now())}catch{return null}
}
module.exports={pendingCbtReminder,loadPendingCbtReminder};
