'use strict';
const { listTickTickProjects, fetchTask, completeTickTickTask, tokenHasWriteScope } = require('./ticktick-client.cjs');

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
  return { ok: true, completed: true, wasOpen, personal: true, taskId };
}
module.exports = { completeRustamPersonalTask };
