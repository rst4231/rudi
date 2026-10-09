'use strict';
// Compare TickTick due dates in the same calendar timezone as the rest of RUDI.
// All-day tasks expire only after their whole day has passed.
function isOverdueTickTickTask(task,now,{calendarDateKey,calendarTime,tickTickTaskDateKeys}){
  if(!task||Number(task.status??0)!==0)return false;
  const due=String(task.dueDate||task.startDate||'').trim();
  if(!due)return false;
  const keys=tickTickTaskDateKeys({...task,startDate:due,dueDate:null});
  const dueDay=keys[0],today=calendarDateKey(now);
  if(!dueDay||!today)return false;
  if(dueDay<today)return true;
  if(dueDay>today||task.isAllDay)return false;
  const dueClock=calendarTime(due),nowClock=calendarTime(now);
  return Boolean(dueClock&&nowClock&&dueClock<nowClock);
}
function countOverdueTickTickTasks(tasks,now,formatters){
  const seen=new Set();
  let count=0;
  for(const task of Array.isArray(tasks)?tasks:[]){
    const id=String(task?.id||'').trim();
    const project=String(task?.projectId||'').trim();
    const key=id?project+':'+id:'';
    if(key&&seen.has(key))continue;
    if(!isOverdueTickTickTask(task,now,formatters))continue;
    if(key)seen.add(key);
    count++;
  }
  return count;
}
module.exports={isOverdueTickTickTask,countOverdueTickTickTasks};
