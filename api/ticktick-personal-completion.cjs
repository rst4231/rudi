'use strict';
const { listTickTickProjects, fetchTask, completeTickTickTask, reopenTickTickTask, updateTickTickTask, tokenHasWriteScope } = require('./ticktick-client.cjs');

// Never trust a project ID from the client without verifying it against
// Rustam's own TickTick token; shared projects are not personal tasks.
async function completeRustamPersonalTask(input = {}, deps = {}) {
  const actor = String(input.actor || '');
  if (actor !== 'Рустам') throw new Error('ticktick-personal-owner-forbidden');
  const token = input.token;
  if (!token?.accessToken) throw new Error('ticktick-personal-not-connected');
  const taskId = String(input.taskId || '').trim();
  const projectId = String(input.projectId || '').trim();
  if (!taskId || !projectId || taskId.length > 200 || projectId.length > 200)
    throw new Error('ticktick-personal-task-invalid');
  if (projectId === String(input.sharedProjectId || ''))
    throw new Error('ticktick-personal-shared-project-forbidden');
  const scopeCheck = deps.tokenHasWriteScope || tokenHasWriteScope;
  if (scopeCheck(token) === false)
    throw new Error('ticktick-personal-write-permission-required');
  const options = input.options || {};
  const list = deps.listTickTickProjects || listTickTickProjects;
  const projects = await list(token.accessToken, options);
  if (!Array.isArray(projects) || !projects.slice(0, 60)
    .some(row => String(row?.id || '') === projectId))
    throw new Error('ticktick-personal-project-forbidden');
  const getTask = deps.fetchTask || fetchTask;
  const task = await getTask(token.accessToken, projectId, taskId, options);
  if (String(task?.id || '') !== taskId || String(task?.projectId || '') !== projectId)
    throw new Error('ticktick-personal-task-mismatch');
  const wasOpen = Number(task?.status ?? 0) === 0;
  if (wasOpen) {
    const complete = deps.completeTickTickTask || completeTickTickTask;
    await complete(token.accessToken, projectId, taskId, options);
  }
  // Save the original task before TickTick hides a completed task from its read API.
  // This is sealed into the short-lived Undo token, never sent back in clear text.
  const taskSnapshot=wasOpen?Object.fromEntries(
    ['id','projectId','title','content','desc','isAllDay','startDate','dueDate',
      'timeZone','reminders','repeatFlag','repeatFrom','priority','sortOrder',
      'items','assigneeUsername','tags','kind']
      .filter(field=>task[field]!==undefined).map(field=>[field,task[field]])
  ):null;
  return { ok: true, completed: true, wasOpen, personal: true, taskId, taskSnapshot };
}

async function reopenRustamPersonalTask(input = {}, deps = {}) {
  const actor = String(input.actor || '');
  if (actor !== 'Рустам') throw new Error('ticktick-personal-owner-forbidden');
  const token = input.token;
  if (!token?.accessToken) throw new Error('ticktick-personal-not-connected');
  const taskId = String(input.taskId || '').trim();
  const projectId = String(input.projectId || '').trim();
  if (!taskId || !projectId || taskId.length > 200 || projectId.length > 200)
    throw new Error('ticktick-personal-task-invalid');
  if (projectId === String(input.sharedProjectId || ''))
    throw new Error('ticktick-personal-shared-project-forbidden');
  const scopeCheck = deps.tokenHasWriteScope || tokenHasWriteScope;
  if (scopeCheck(token) === false)
    throw new Error('ticktick-personal-write-permission-required');
  const options = input.options || {};
  const list = deps.listTickTickProjects || listTickTickProjects;
  const projects = await list(token.accessToken, options);
  if (!Array.isArray(projects) || !projects.slice(0, 60)
    .some(row => String(row?.id || '') === projectId))
    throw new Error('ticktick-personal-project-forbidden');
  const getTask = deps.fetchTask || fetchTask;
  const original=input.taskSnapshot;
  if(original&&(String(original.id||'')!==taskId||String(original.projectId||'')!==projectId))
    throw new Error('ticktick-personal-task-mismatch');
  let task;
  try {
    task=await getTask(token.accessToken,projectId,taskId,options);
  } catch(error) {
    // Completed tasks are not always available via the TickTick Open API.
    const code=String(error?.message||'');
    // A temporary read outage should not block a best-effort restore from
    // the sealed snapshot, while unauthorized and validation errors still fail.
    if(!original||!/^ticktick-(?:task-not-found|network-failed|api-failed:5\d\d|api-failed:429)$/.test(code))
      throw error;
    task=original;
  }
  if (String(task?.id || '') !== taskId || String(task?.projectId || '') !== projectId)
    throw new Error('ticktick-personal-task-mismatch');
  if (task!==original&&Number(task.status ?? 0) === 0)
    return { ok: true, reopened: true, alreadyOpen: true, personal: true, taskId };
  const reopen = deps.reopenTickTickTask || reopenTickTickTask;
  await reopen(token.accessToken, projectId, taskId, {
    ...options, task, force:Boolean(original)
  });
  return { ok: true, reopened: true, personal: true, taskId };
}
// A vertical drag reschedules a single personal task. Never touch a shared project.
// The route must authorize task ownership and OAuth scope before calling this helper.
async function rescheduleTickTickTaskTime(input={},deps={}){
  const task=input.task;
  const taskId=String(input.taskId||'').trim();
  const projectId=String(input.projectId||'').trim();
  const date=String(input.date||'').trim();
  const time=String(input.time||'').trim();
  if(!taskId||!projectId||String(task?.id||'')!==taskId||
     String(task?.projectId||'')!==projectId)
    throw new Error('ticktick-personal-task-mismatch');
  if(!/^20\d\d-(0[1-9]|1[0-2])-([0-2]\d|3[01])$/.test(date)||
     !/^([01]\d|2[0-3]):(00|15|30|45)$/.test(time)||
     new Date(date+'T00:00:00Z').toISOString().slice(0,10)!==date)
    throw new Error('ticktick-personal-time-invalid');
  if(Number(task.status??0)!==0||task.isAllDay===true)
    throw new Error('ticktick-personal-reschedule-unsupported');
  const original=String(task.startDate||task.dueDate||'');
  const oldMillis=Date.parse(original);
  const newMillis=Date.parse(date+'T'+time+':00+03:00');
  if(!Number.isFinite(oldMillis)||!Number.isFinite(newMillis))
    throw new Error('ticktick-personal-date-mismatch');
  const originalMoscow=new Date(oldMillis+3*60*60*1000);
  const series=Boolean(String(task.repeatFlag||'').trim());
  if(!series&&originalMoscow.toISOString().slice(0,10)!==date)
    throw new Error('ticktick-personal-date-mismatch');
  // Change the recurring task's clock time, not its anchor day or RRULE.
  const originalMinutes=originalMoscow.getUTCHours()*60+originalMoscow.getUTCMinutes();
  const targetMinutes=Number(time.slice(0,2))*60+Number(time.slice(3,5));
  const delta=series?(targetMinutes-originalMinutes)*60000:newMillis-oldMillis;
  if(!delta)return {ok:true,moved:false,taskId,date,time,series};
  const format=millis=>new Date(millis).toISOString().replace(/\.\d{3}Z$/,'+0000');
  const existingStart=task.startDate?Date.parse(task.startDate):null;
  const existingDue=task.dueDate?Date.parse(task.dueDate):null;
  if((existingStart!==null&&!Number.isFinite(existingStart))||
     (existingDue!==null&&!Number.isFinite(existingDue))||
     (existingStart!==null&&existingDue!==null&&
       (existingDue-existingStart<0||existingDue-existingStart>24*60*60*1000)))
    throw new Error('ticktick-personal-date-mismatch');
  const changes={
    title:String(task.title||'').trim(),
    isAllDay:false,
    startDate:existingStart===null?'':format(existingStart+delta),
    dueDate:existingDue===null?'':format(existingDue+delta),
    desc:String(task.desc||''),
    timeZone:String(task.timeZone||'Europe/Moscow'),
    repeatFlag:String(task.repeatFlag||'')
  };
  if(!changes.title)throw new Error('ticktick-personal-task-invalid');
  await (deps.updateTickTickTask||updateTickTickTask)(
    input.accessToken,projectId,taskId,changes,input.options||{}
  );
  return {ok:true,moved:true,taskId,date,time,series};
}

// A private TickTick task requires Rustam's own token and project ownership.
async function rescheduleRustamPersonalTask(input={},deps={}){
  const actor=String(input.actor||'');
  if(actor!=='Рустам')throw new Error('ticktick-personal-owner-forbidden');
  const token=input.token;
  if(!token?.accessToken)throw new Error('ticktick-personal-not-connected');
  const taskId=String(input.taskId||'').trim();
  const projectId=String(input.projectId||'').trim();
  const date=String(input.date||'').trim();
  const time=String(input.time||'').trim();
  if(!taskId||!projectId||taskId.length>200||projectId.length>200)
    throw new Error('ticktick-personal-task-invalid');
  if(projectId===String(input.sharedProjectId||''))
    throw new Error('ticktick-personal-shared-project-forbidden');
  if((deps.tokenHasWriteScope||tokenHasWriteScope)(token)===false)
    throw new Error('ticktick-personal-write-permission-required');
  const options=input.options||{};
  const projects=await (deps.listTickTickProjects||listTickTickProjects)(token.accessToken,options);
  if(!Array.isArray(projects)||!projects.slice(0,60).some(row=>String(row?.id||'')===projectId))
    throw new Error('ticktick-personal-project-forbidden');
  const task=await (deps.fetchTask||fetchTask)(token.accessToken,projectId,taskId,options);
  return rescheduleTickTickTaskTime({
    task,accessToken:token.accessToken,taskId,projectId,date,time,options
  },deps);
}

module.exports = { completeRustamPersonalTask, reopenRustamPersonalTask, rescheduleRustamPersonalTask, rescheduleTickTickTaskTime };
