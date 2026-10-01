const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const {addCarNote,removeCarNote,restoreCarNote,readCarState}=require('../api/car-store.cjs');

function clone(v){return v==null?v:JSON.parse(JSON.stringify(v));}
function memory(){
  const c={v:null},d={v:null};
  return {
    cache:{get:async()=>clone(c.v),set:async(_k,v)=>{c.v=clone(v);return true;}},
    db:{read:async()=>clone(d.v),write:async v=>{d.v=clone(v);return clone(v);}},
    clearCache:()=>{c.v=null;}
  };
}

test('car notes persist in durable DB and can be restored with same id',async()=>{
  const m=memory();
  const added=await addCarNote('Сервис: https://example.com',{...m,now:'2026-10-01T08:00:00Z'});
  assert.equal(added.state.notes.length,1);
  const id=added.note.id;
  const removed=await removeCarNote(id,{...m,now:'2026-10-01T08:01:00Z'});
  assert.equal(removed.state.notes.length,0);
  const restored=await restoreCarNote(removed.note,{...m,now:'2026-10-01T08:02:00Z'});
  assert.equal(restored.state.notes[0].id,id);
  m.clearCache();
  const reloaded=await readCarState(m);
  assert.equal(reloaded.notes[0].text,'Сервис: https://example.com');
});

test('car notes UI is a smart card fixed after tasks with 5 second undo',()=>{
  const html=fs.readFileSync('public/index.html','utf8');
  const js=fs.readFileSync('public/car.js','utf8');
  assert.match(html,/id="carNotesTitle">Заметки/);
  assert.match(js,/buildCarSmartCard\('notes','Заметки',notes\)/);
  assert.match(js,/taskCard\.nextSibling/);
  assert.match(js,/setTimeout\(\(\)=>hideNoteUndo\(\),5000\)/);
  assert.match(js,/remove\.textContent='×'/);
  assert.match(js,/api\('restore-note',\{note\}\)/);
});
