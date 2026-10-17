'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs');
const js=fs.readFileSync('public/app.js','utf8');
const html=fs.readFileSync('public/index.html','utf8');
const css=fs.readFileSync('public/app.css','utf8');
test('task title and card route to modal, never expand description',()=>{
  const start=js.indexOf('function renderTickTickTodayState(');
  const end=js.indexOf('function setupTickTickDisclosure(){',start);
  assert.ok(start>0&&end>start);
  const render=js.slice(start,end);
  assert.match(render,/copy\.addEventListener\('click',event=>\{/);
  assert.match(render,/openTickTickTaskForEditing\?\.\(task\)/);
  assert.match(render,/row\.addEventListener\('click',event=>\{/);
  assert.doesNotMatch(render,/copy\.classList\.toggle\('has-details'/);
  assert.doesNotMatch(render,/const alreadyOpen=panel\.dataset\.openTaskId/);
  assert.doesNotMatch(render,/ticktick-today-edit|ticktick-today-delete/);
});
test('checklist has an explicitly separate toggle and no inline description',()=>{
  assert.match(js,/checklistButton\.className='ticktick-agenda-checklist-toggle'/);
  assert.match(js,/inlineDetails\.querySelector\('\.ticktick-detail-block'\)\?\.remove\(\)/);
  assert.match(js,/list\.querySelectorAll\('\.ticktick-today-inline-details'\)/);
  assert.match(css,/\.ticktick-agenda-checklist-toggle/);
});
test('modal delete appears only when authorized, preserves undo and restores on failure',()=>{
  assert.equal((html.match(/id="ticktickTaskDeleteButton"/g)||[]).length,1);
  assert.match(html,/<button id="ticktickTaskDeleteButton" type="button" hidden>Удалить дело<\/button>/);
  assert.match(js,/deleteButton\.hidden=!\(editingTask\?\.canDelete&&sharedAgendaLatestPayload\?\.writable!==false\)/);
  assert.match(js,/const deleted=await deleteTickTickTodayTask\(task,row,deleteButton\)/);
  assert.match(js,/if\(deleted\)\{close\(\);/);
  assert.match(js,/showUndoSnackbar\('Задача удалена'/);
  assert.match(css,/#ticktickTaskDeleteButton\[hidden\]\{display:none!important\}/);
});
test('real profile photos and independent completion remain untouched',()=>{
  assert.match(js,/updateSharedAgendaAvatarPhoto\(avatar\)/);
  assert.match(js,/completeTickTickTodayTask\(task,row,complete,payload\?\.writable!==false\)/);
  assert.match(js,/sharedAgendaSelectedDay==='tomorrow'/);
  assert.match(js,/managedJsonRequest\(agendaScope==='shared'\?'ticktick-today':'ticktick-today:personal:'\+agendaActor,'\/api\/ticktick\/today'/);
});
