const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');

const client=fs.readFileSync('public/messenger.js','utf8');
const css=fs.readFileSync('public/messenger.css','utf8');

test('v3.24 anchors context menu to the selected message bubble',()=>{
  assert.match(client,/function positionContextMenu\(menu,article\)/);
  assert.match(client,/article\.querySelector\('\.messenger-bubble'\)\|\|article/);
  assert.match(client,/menu\.style\.top=top\+'px'/);
  assert.match(client,/menu\.style\.visibility='visible'/);
  assert.match(css,/\.messenger-context-menu\{[\s\S]*?top:0;[\s\S]*?bottom:auto/);
});

test('v3.24 shows reactions directly in context menu',()=>{
  assert.match(client,/function appendContextReactionTray\(menu,row\)/);
  assert.match(client,/appendContextReactionTray\(menu,row\)/);
  assert.match(client,/REACTIONS=\['❤️','😂','😘','😢','👍','🔥'\]/);
  assert.doesNotMatch(client,/\['Реакция',\(\)=>showReactionPicker/);
});

test('v3.24 double tap toggles heart reliably on touch devices',()=>{
  assert.match(client,/article\.addEventListener\('touchend'/);
  assert.match(client,/if\(count>=2\)/);
  assert.match(client,/setMessageReaction\(row,'❤️'\)/);
  assert.match(client,/Date\.now\(\)-lastTouchEndAt<700/);
});

test('v3.24 tapping own reaction removes it and reaction shows actor avatars',()=>{
  assert.match(client,/if\(actors\.includes\(state\.actor\)\) setMessageReaction\(row,emoji\)/);
  assert.match(client,/function appendReactionAvatars\(container,actors\)/);
  assert.match(client,/appendReactionAvatars\(reaction,actors\)/);
  assert.match(css,/\.messenger-reaction-avatar\{/);
  assert.match(css,/\.messenger-reaction-avatar img\{/);
});
