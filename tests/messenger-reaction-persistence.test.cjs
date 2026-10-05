const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');

const source=fs.readFileSync(path.join(__dirname,'..','public','messenger.js'),'utf8');

test('successful reactions are protected from stale live snapshots',()=>{
  assert.match(source,/reactionOverrides:new Map\(\)/);
  assert.match(source,/function applyReactionOverrides\(rows\)/);
  assert.match(source,/state\.reactionOverrides\.set\(String\(row\.id\|\|''\),/);
  assert.match(source,/reactions:data\.message\.reactions/);
  assert.match(source,/likedBy:data\.message\.likedBy/);
  assert.match(source,/const nextRows=applyReactionOverrides\(mergePendingRows\(serverRows\)\)/);
});

test('reaction override clears once the server snapshot catches up',()=>{
  assert.match(source,/rowsSignature\(\[serverRow\]\)===rowsSignature\(\[expectedRow\]\)/);
  assert.match(source,/state\.reactionOverrides\.delete\(id\)/);
});
