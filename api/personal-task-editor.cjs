'use strict';

// Rustam's private TickTick mutations. Never fall back to the shared OAuth token.
const {
  listTickTickProjects, fetchTask, updateTickTickTask, createTickTickTask,
  deleteTickTickTask, tokenHasWriteScope
}=require('./ticktick-client.cjs');

function personalLists(projects,sharedProjectId){
  return (Array.isArray(projects)?projects:[])
    .filter(p=>p&&String(p.id||'')!==String(sharedProjectId||'')&&p.closed!==true&&String(p.kind||'TASK').toUpperCase()!=='NOTE')
    .map(p=>({id:String(p.id||''),name:String(p.name||'Список').slice(0,100)}))
    .filter(p=>p.id);
}
function dateTime(date,time){
  if(!date)return '';
  if(!/^20\d{2}-(0[1-9]|1[0-2])-([0-2]\d|3[01])$/.test(date)||
    new Date(date+'T00:00:00Z').toISOString().slice(0,10)!==date)
    throw Error('ticktick-personal-date-invalid');
  if(time&&!/^([01]\d|2[0-3]):[0-5]\d$/.test(time))throw Error('ticktick-personal-time-invalid');
  return date+'T'+(time||'00:00')+':00+0300';
}
function editable(input,task){
  const title=String(input.title??task.title??'').trim().slice(0,500);
  if(!title)throw Error('ticktick-personal-title-required');
  const date=String(input.date??'').trim();
  const time=date?String(input.time||'').trim():'';
  if(!date&&String(task.repeatFlag||'').trim())throw Error('ticktick-personal-repeat-date-required');
  const datetime=dateTime(date,time);
  const changes={
    title,desc:String(input.description??task.desc??'').slice(0,5000),
    isAllDay:!time,startDate:datetime,dueDate:datetime,
    timeZone:'Europe/Moscow',repeatFlag:String(task.repeatFlag||'')
  };
  return changes;
}
async function editPersonalTask(input,deps={}){
  const actor=String(input.actor||'');
  if(actor!=='Рустам')throw Error('ticktick-personal-owner-forbidden');
  const token=input.token;
  if(!token?.accessToken)throw Error('ticktick-personal-not-connected');
  if((deps.tokenHasWriteScope||tokenHasWriteScope)(token)===false)
    throw Error('ticktick-personal-write-permission-required');
  const taskId=String(input.taskId||''),projectId=String(input.projectId||'');
  if(!/^[A-Za-z0-9_-]{1,200}$/.test(taskId)||!/^[A-Za-z0-9_-]{1,200}$/.test(projectId))
    throw Error('ticktick-personal-task-invalid');
  const lists=personalLists(await (deps.listTickTickProjects||listTickTickProjects)(token.accessToken,input.options||{}),input.sharedProjectId);
  const targetId=String(input.targetProjectId||projectId);
  if(!lists.some(p=>p.id===projectId)||!lists.some(p=>p.id===targetId))
    throw Error('ticktick-personal-project-forbidden');
  const original=await (deps.fetchTask||fetchTask)(token.accessToken,projectId,taskId,input.options||{});
  if(String(original?.id||'')!==taskId||String(original?.projectId||'')!==projectId)
    throw Error('ticktick-personal-task-mismatch');
  if(Number(original.status??0)!==0)throw Error('ticktick-personal-task-completed');
  if(input.operation==='delete'){
    await (deps.deleteTickTickTask||deleteTickTickTask)(token.accessToken,projectId,taskId,input.options||{});
    return {ok:true,deleted:true,taskId};
  }
  if(input.operation!=='save')throw Error('ticktick-personal-operation-invalid');
  const changes=editable(input,original);
  if(targetId===projectId){
    await (deps.updateTickTickTask||updateTickTickTask)(token.accessToken,projectId,taskId,changes,input.options||{});
    return {ok:true,updated:true,taskId,projectId,date:String(input.date||'')};
  }
  // The documented Open API does not reliably support changing projectId by UPDATE.
  // Copy first and verify before deleting the original; on failure the source remains.
  const created=await (deps.createTickTickTask||createTickTickTask)(token.accessToken,{
    ...original,...changes,projectId:targetId,
    items:original.items,reminders:original.reminders,tags:original.tags,
    priority:original.priority,repeatFrom:original.repeatFrom,content:original.content
  },input.options||{});
  const newId=String(created?.id||'');
  if(!newId)throw Error('ticktick-personal-move-unconfirmed');
  let verified=false;
  try{
    const readback=await (deps.fetchTask||fetchTask)(token.accessToken,targetId,newId,input.options||{});
    verified=String(readback?.id||'')===newId&&String(readback?.projectId||'')===targetId&&String(readback?.title||'')===changes.title;
  }catch(_){}
  if(!verified)throw Error('ticktick-personal-move-unconfirmed');
  try{
    await (deps.deleteTickTickTask||deleteTickTickTask)(token.accessToken,projectId,taskId,input.options||{});
  }catch(error){
    // Best effort remove duplicate without touching the original task.
    await (deps.deleteTickTickTask||deleteTickTickTask)(token.accessToken,targetId,newId,input.options||{}).catch(()=>{});
    throw error;
  }
  return {ok:true,moved:true,taskId:newId,projectId:targetId,date:String(input.date||'')};
}
module.exports={personalLists,dateTime,editable,editPersonalTask};
