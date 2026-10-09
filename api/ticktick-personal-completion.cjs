'use strict';
const { listTickTickProjects, fetchTask, completeTickTickTask, reopenTickTickTask, tokenHasWriteScope } = require('./ticktick-client.cjs');

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
    if(String(error?.message||'')!=='ticktick-task-not-found'||!original)throw error;
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
module.exports = { completeRustamPersonalTask, reopenRustamPersonalTask };
