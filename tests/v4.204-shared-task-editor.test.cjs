'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs');
const js=fs.readFileSync('public/app.js','utf8');
const html=fs.readFileSync('public/index.html','utf8');
const css=fs.readFileSync('public/app.css','utf8');
test('task rows have no inline edit and delete buttons',()=>{
  assert.doesNotMatch(js,/className='ticktick-today-edit'/);
  assert.doesNotMatch(js,/className='ticktick-today-delete'/);
  assert.doesNotMatch(js,/row\.appendChild\(actions\)/);
  assert.match(js,/copy\.addEventListener\('click',event=>\{[\s\S]*?openTickTickTaskForEditing\?\.\(task\)/);
  assert.match(js,/row\.addEventListener\('click',event=>/);
});
test('checklist and description remain accessible via own arrow',()=>{
  assert.match(js,/className='ticktick-today-details-toggle'/);
  assert.match(js,/inlineDetails\.hidden=alreadyOpen/);
  assert.match(js,/createTickTickInlineDetails\(task/);
  assert.match(css,/\.ticktick-today-details-toggle\[aria-expanded="true"\]/);
});
test('delete button is in modal, respects delete rights and existing undo',()=>{
  assert.equal((html.match(/id="ticktickTaskDeleteButton"/g)||[]).length,1);
  assert.match(html,/id="ticktickTaskDeleteButton"[^>]*hidden>Удалить дело<\/button>/);
  assert.match(js,/deleteButton\.hidden=!\(editingTask\?\.canDelete===true\)/);
  assert.match(js,/window\.confirm\('Удалить дело/);
  assert.match(js,/deleteTickTickTodayTask\(task,row,deleteButton\)/);
  assert.match(js,/if\(deleted\)close\(\)/);
  assert.match(js,/showUndoSnackbar\('Задача удалена'/);
  assert.match(css,/#ticktickTaskDeleteButton\[hidden\]/);
});
test('tasks lacking edit rights open read-only editor',()=>{
  assert.match(js,/const editable=!editingTask\|\|editingTask\.canDelete===true\|\|editingTask\.canEdit===true/);
  assert.match(js,/if\(control\)control\.disabled=!editable/);
  assert.match(js,/save\.hidden=!editable/);
});
test('existing profile-photo avatar implementation is untouched',()=>{
  assert.match(js,/const sharedAgendaActorPhotos=\{rustam:'',diana:''\}/);
  assert.match(js,/function updateSharedAgendaAvatarPhoto\(holder\)/);
  assert.match(js,/setSharedAgendaAvatarPhoto\(actor,profile\)/);
  assert.match(js,/photo\.className='shared-agenda-avatar-photo'/);
  assert.match(css,/\.shared-agenda-avatar\.has-photo img\{opacity:1\}/);
});
