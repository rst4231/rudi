const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),{JSDOM}=require('jsdom');
test('personal note heading follows its saved title and pencil is visible while copy and undo stay hidden',()=>{
 const dom=new JSDOM(fs.readFileSync('public/index.html','utf8'),{runScripts:'outside-only'}),w=dom.window,d=w.document;
 try{const source=fs.readFileSync('public/home-note.js','utf8'),start=source.indexOf('function render(){'),end=source.indexOf('async function load(',start);
 const style=d.createElement('style');style.textContent=fs.readFileSync('public/home-note.css','utf8');d.head.append(style);
 w.eval(`const root=document.getElementById('homeNoteTile'),$=id=>document.getElementById(id),heading=$('homeNoteToggle'),edit=$('homeNoteEdit'),editIcon=$('homeNoteEditIcon'),editLabel=$('homeNoteEditLabel'),copy=$('homeNoteCopy'),proofread=$('homeNoteProofread'),content=$('homeNoteContent'),preview=$('homeNotePreview'),editor=$('homeNoteEditor'),titleInput=$('homeNoteTitle'),save=$('homeNoteSave'),cancel=$('homeNoteCancel'),textarea=$('homeNoteText');let text='Текст',loaded=true,expanded=true,editing=false,busy=false,correcting=false,partner=false,noteTitle='Мои планы';function current(){return {title:noteTitle}}function renderPreview(){}function renderNotes(){};`+source.slice(start,end)+`;window.setTestTitle=value=>noteTitle=value;window.setTestEditing=value=>editing=value;render();`);
 assert.equal(d.querySelector('#homeNoteToggle > span:last-child').textContent,'Мои планы');assert.notEqual(w.getComputedStyle(d.getElementById('homeNoteEdit')).display,'none');
 w.setTestTitle('   ');w.render();assert.equal(d.querySelector('#homeNoteToggle > span:last-child').textContent,'Личная заметка');
 for(const id of ['homeNoteCopy','homeNoteUndo']){d.getElementById(id).hidden=false;assert.equal(w.getComputedStyle(d.getElementById(id)).display,'none')}
 w.setTestEditing(true);w.render();assert.equal(w.getComputedStyle(d.getElementById('homeNoteEdit')).display,'none');
 }finally{w.close()}
});
