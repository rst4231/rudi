const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');

const client=fs.readFileSync('public/messenger.js','utf8');
const css=fs.readFileSync('public/messenger.css','utf8');
const html=fs.readFileSync('public/index.html','utf8');
const sw=fs.readFileSync('public/sw.js','utf8');

test('v3.21 locks messenger shell while keeping message list vertically scrollable',()=>{
  assert.match(css,/\.messenger-page\{[\s\S]*?overscroll-behavior:none;[\s\S]*?touch-action:none/);
  assert.match(css,/\.messenger-messages\{[\s\S]*?overscroll-behavior:none;[\s\S]*?touch-action:pan-y/);
});

test('v3.21 fixes first iPhone keyboard focus immediately and resyncs VisualViewport',()=>{
  assert.match(client,/classList\.add\('is-keyboard-open'\)/);
  assert.match(client,/\[40,90,160,260,420\]\.forEach/);
  assert.match(client,/syncMessengerViewport\(\)/);
});

test('v3.21 delete preserves current scroll position',()=>{
  assert.match(client,/preservedScrollTop=Number\(list\?\.scrollTop\|\|0\)/);
  assert.match(client,/renderMessages\(\{preserveScrollTop:preservedScrollTop\}\)/);
  assert.match(client,/function renderMessages\(\{preserveScrollTop=null\}=\{\}\)/);
});

test('v3.21 sends before iPhone blur consumes the first tap',()=>{
  assert.match(client,/send\.addEventListener\('pointerdown',sendBeforeBlur\)/);
  assert.match(client,/event\.preventDefault\(\)/);
  assert.match(client,/sendCurrentMessage\(\)/);
});

test('v3.21 uses Telegram-like checkmarks instead of status words',()=>{
  assert.match(client,/status\.textContent=row\.readAt\?'✓✓':'✓'/);
  assert.match(client,/messenger-read-status'\+\(row\.readAt\?' is-read':''\)/);
  assert.match(css,/\.messenger-read-status\.is-read\{color:#83d4ff\}/);
  assert.doesNotMatch(client,/status\.textContent=row\.editedAt\?'Изменено':\(row\.readAt\?'Прочитано':'Отправлено'\)/);
});

test('v3.21 lowers messenger header below the top blur',()=>{
  assert.match(css,/\.messenger-head\{[\s\S]*?margin-top:6px/);
});

test('messenger shell cache-busts to the current RUDI version',()=>{
  const version=JSON.parse(fs.readFileSync('rudi-version.json','utf8')).current.replace(/^v/,'');
  assert.match(html,new RegExp('messenger\\.js\\?v='+version.replace(/\\./g,'\\\\.')));
  assert.match(html,new RegExp('messenger\\.css\\?v='+version.replace(/\\./g,'\\\\.')));
  assert.match(html,new RegExp('meta name="rudi-version" content="v'+version.replace(/\\./g,'\\\\.')+'"'));
  assert.match(sw,new RegExp('rudi-shell-v'+version.replace(/\\./g,'\\\\.')));
});

test('v3.21 shows current partner mood emoji next to messenger name and observes mood changes',()=>{
  assert.match(client,/function partnerMoodEmoji\(\)/);
  assert.match(client,/sadness:'😢'/);
  assert.match(client,/joy:'😄'/);
  assert.match(client,/love:'🥰'/);
  assert.match(client,/title\.textContent=\(state\.partner\|\|'Партнёр'\)\+\(moodEmoji\?' '\+moodEmoji:''\)/);
  assert.match(client,/new MutationObserver\(updateHeader\)\.observe\(partnerMood,\{attributes:true,attributeFilter:\['data-mood'\]\}\)/);
});

test('v3.21 one tap on own heart removes the like without triggering message gestures',()=>{
  assert.match(client,/const canUnlike=likedBy\.includes\(state\.actor\)/);
  assert.match(client,/document\.createElement\(canUnlike\?'button':'div'\)/);
  assert.match(client,/reaction\.setAttribute\('aria-label','Снять лайк'\)/);
  assert.match(client,/event\.stopPropagation\(\);[\s\S]*?toggleMessageLike\(row\)/);
  assert.match(client,/renderMessages\(\{preserveScrollTop:preservedScrollTop\}\)/);
});

test('v3.21 tapping anywhere else hides the visible delete action',()=>{
  assert.match(client,/page\.addEventListener\('pointerdown',event=>\{/);
  assert.match(client,/if\(event\.target\.closest\('\.messenger-delete-action'\)\) return/);
  assert.match(client,/hideDeleteActions\(\)/);
});

test('v3.21 mood notifications default on while explicit opt-out stays off',()=>{
  const prefs=require('../api/ui-preferences-store.cjs');
  const defaults=prefs.normalizeUiPreferencesState({});
  const off=prefs.normalizeUiPreferencesState({moodNotifyPartnerEnabled:false,moodReceivePartnerEnabled:false});
  assert.equal(defaults.moodNotifyPartnerEnabled,true);
  assert.equal(defaults.moodReceivePartnerEnabled,true);
  assert.equal(off.moodNotifyPartnerEnabled,false);
  assert.equal(off.moodReceivePartnerEnabled,false);
  const app=fs.readFileSync('public/app.js','utf8');
  assert.match(app,/id="settingsMoodNotifyPartnerToggle"[^>]+aria-checked="true"/);
  assert.match(app,/id="settingsMoodReceivePartnerToggle"[^>]+aria-checked="true"/);
});
