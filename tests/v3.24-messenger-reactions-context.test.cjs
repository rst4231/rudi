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

test('double tap uses delegated pointerdown and only toggles heart',()=>{
  assert.match(client,/messages\.addEventListener\('pointerdown'/);
  assert.match(client,/state\.tapMessageId===id&&now-state\.tapAt<=460/);
  assert.match(client,/setMessageReaction\(row,'❤️'\)/);
  assert.doesNotMatch(client,/count>=3/);
});

test('tapping a reaction is delegated on pointerdown and shows actor avatars',()=>{
  assert.match(client,/page\.addEventListener\('pointerdown',event=>\{/);
  assert.match(client,/\[data-messenger-reaction\]\[data-message-id\]/);
  assert.match(client,/setMessageReaction\(row,emoji\)/);
  assert.match(client,/function appendReactionAvatars\(container,actors\)/);
  assert.match(client,/appendReactionAvatars\(reaction,actors\)/);
  assert.match(css,/\.messenger-reaction-avatar\{/);
  assert.match(css,/\.messenger-reaction-avatar img\{/);
});

test('context menu opens only from hold and not from contextmenu or double click',()=>{
  assert.match(client,/timer=setTimeout\(\(\)=>\{[\s\S]*?showMessageContext\(article,row,payload\)/);
  assert.match(client,/article\.addEventListener\('contextmenu',event=>\{[\s\S]*?event\.preventDefault\(\)[\s\S]*?event\.stopPropagation\(\)[\s\S]*?cancel\(\)/);
  assert.doesNotMatch(client,/contextmenu'[\s\S]*?showMessageContext/);
  assert.match(client,/article\.addEventListener\('dblclick',event=>\{/);
});

test('emoji tray toggle keeps messenger input focused',()=>{
  assert.match(client,/function bindPage\(\)/);
  assert.match(client,/toggleEmojiTrayWithoutBlur/);
  assert.match(client,/emoji\.addEventListener\('pointerdown',toggleEmojiTrayWithoutBlur\)/);
  assert.match(client,/input\.focus\(\{preventScroll:true\}\)/);
});
