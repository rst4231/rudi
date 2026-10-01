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

test('double tap uses the original click counter and only toggles heart',()=>{
  assert.match(client,/function bindMessageTapGestures\(article,row,payload\)/);
  assert.match(client,/article\.addEventListener\('click',event=>\{/);
  assert.match(client,/if\(count===2\) setMessageReaction\(row,'❤️'\)/);
  assert.doesNotMatch(client,/count>=3/);
});

test('tapping a reaction uses a direct click and shows actor avatars',()=>{
  assert.match(client,/reaction\.addEventListener\('click',event=>\{/);
  assert.match(client,/setMessageReaction\(row,emoji\)/);
  assert.match(client,/function appendReactionAvatars\(container,actors\)/);
  assert.match(client,/appendReactionAvatars\(reaction,actors\)/);
  assert.match(css,/\.messenger-reaction-avatar\{/);
  assert.match(css,/\.messenger-reaction-avatar img\{/);
});

test('context menu opens only from hold while double tap remains a normal click sequence',()=>{
  assert.match(client,/timer=setTimeout\(\(\)=>\{[\s\S]*?showMessageContext\(article,row,payload\)/);
  assert.match(client,/article\.addEventListener\('contextmenu',event=>\{[\s\S]*?event\.preventDefault\(\)[\s\S]*?event\.stopPropagation\(\)[\s\S]*?cancel\(\)/);
  assert.doesNotMatch(client,/contextmenu'[\s\S]*?showMessageContext/);
  assert.doesNotMatch(client,/article\.addEventListener\('dblclick'/);
});

test('emoji tray toggle keeps messenger input focused',()=>{
  assert.match(client,/function bindPage\(\)/);
  assert.match(client,/toggleEmojiTrayWithoutBlur/);
  assert.match(client,/emoji\.addEventListener\('pointerdown',toggleEmojiTrayWithoutBlur\)/);
  assert.match(client,/input\.focus\(\{preventScroll:true\}\)/);
});
