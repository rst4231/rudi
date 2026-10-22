(function(root,factory){
  const policy=factory();
  if(typeof module==='object'&&module.exports)module.exports=policy;
  else root.RUDITaskCompletionPolicy=policy;
})(typeof globalThis!=='undefined'?globalThis:this,function(){
  'use strict';
  const ERROR='task-completion-future-forbidden';
  const MESSAGE='Выполнить задачу можно только в её день или позже';
  function moscowDateKey(value=Date.now()){
    const date=new Date(value);
    if(!Number.isFinite(date.getTime()))return '';
    const parts=new Intl.DateTimeFormat('en-CA',{timeZone:'Europe/Moscow',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(date);
    const map=Object.fromEntries(parts.map(p=>[p.type,p.value]));
    return map.year+'-'+map.month+'-'+map.day;
  }
  function taskDateKey(task){
    const occurrence=String(task?.id||'').match(/__(\d{4}-\d{2}-\d{2})$/);
    if(occurrence)return occurrence[1];
    const explicit=String(task?.date||'');
    if(/^\d{4}-\d{2}-\d{2}$/.test(explicit))return explicit;
    const raw=String(task?.startDate||task?.originalStartDate||task?.dueDate||'');
    return /^\d{4}-\d{2}-\d{2}$/.test(raw)?raw:raw?moscowDateKey(raw):'';
  }
  function isFutureTask(task,now=Date.now()){
    const date=taskDateKey(task),today=moscowDateKey(now);
    return Boolean(date&&today&&date>today);
  }
  function assertTaskCompletionAllowed(task,now=Date.now()){
    if(isFutureTask(task,now))throw Error(ERROR);
  }
  return {ERROR,MESSAGE,moscowDateKey,taskDateKey,isFutureTask,assertTaskCompletionAllowed};
});
