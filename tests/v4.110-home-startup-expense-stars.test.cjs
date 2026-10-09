const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const app=fs.readFileSync('public/app.js','utf8');
const css=fs.readFileSync('public/app.css','utf8');
const finance=fs.readFileSync('api/finances.js','utf8');
const prefsSource=fs.readFileSync('api/ui-preferences-store.cjs','utf8');
const {awardScore,reverseScoreByDedupeKey,scoreDateKey,scoreView,DAILY_EXPENSE_SCORE_UNITS,resetMutationQueueForTests}=require('../api/score-store.cjs');
const {normalizeUiPreferencesState,saveUiPreferences,resetMutationQueueForTests:resetPrefs}=require('../api/ui-preferences-store.cjs');
function memoryCache(initial=null){let state=initial;return{async get(){return state},async set(_key,next){state=next;return true}}}
test('star stickers stay absent from avatars while finance wallet remains',()=>{
  const profile=app.slice(app.indexOf('const makePersonTile=(actor,identity)=>{'),app.indexOf('const selfActor=currentActor'));
  assert.doesNotMatch(profile,/scoreSticker|className='score-sticker'/);
  assert.match(profile,/avatarWrap\.append\(avatar\)/);
  assert.doesNotMatch(css.slice(css.indexOf('/* RUDI v4.110: compact profile cards')),/score-avatar-wrap > \.score-sticker/);
  assert.match(app,/renderFinanceStarsWallet\(\)/);
});
test('profile card compactness preserves avatar and action sizes',()=>{
  const release=css.slice(css.indexOf('/* RUDI v4.110: compact profile cards'));
  assert.match(release,/padding-block:9px!important/);
  assert.match(release,/min-height:56px!important/);
  assert.doesNotMatch(release,/\.avatar\s*\{|\.profile-contact-button\s*\{/);
});
test('first expense bonus is 0.2 daily, separate actors and double credit is blocked',async()=>{
  resetMutationQueueForTests();
  assert.equal(DAILY_EXPENSE_SCORE_UNITS,2);
  const now=Date.parse('2026-10-09T12:00:00.000Z'),day=scoreDateKey(now);
  const key='score:finance-daily:Рустам:'+day;
  const id='11111111-1111-4111-8111-111111111111';
  const cache=memoryCache();
  const first=await awardScore('Рустам',DAILY_EXPENSE_SCORE_UNITS,{label:'Первый расход за день',dedupeKey:key,expenseRef:id},{scoreCache:cache,now});
  assert.equal(first.awardedUnits,2);
  assert.equal(first.state.dedupe[key],id);
  const second=await awardScore('Рустам',DAILY_EXPENSE_SCORE_UNITS,{label:'Первый расход за день',dedupeKey:key,expenseRef:'22222222-2222-4222-8222-222222222222'},{scoreCache:cache,now:now+1000});
  assert.equal(second.awardedUnits,0);
  assert.equal(second.duplicate,true);
  const diana=await awardScore('Диана',DAILY_EXPENSE_SCORE_UNITS,{label:'Первый расход за день',dedupeKey:'score:finance-daily:Диана:'+day,expenseRef:'33333333-3333-4333-8333-333333333333'},{scoreCache:cache,now});
  assert.equal(diana.awardedUnits,2);
  const view=scoreView(diana.state,{now});
  assert.equal(view.balances['Рустам'],.2);
  assert.equal(view.balances['Диана'],.2);
  const reversal=await reverseScoreByDedupeKey(key,{skipStreak:true},{scoreCache:cache,now:now+2000});
  assert.equal(reversal.reversedUnits,2);
  assert.equal(scoreView(reversal.state,{now}).balances['Рустам'],0);
  assert.equal(scoreView(reversal.state,{now}).balances['Диана'],.2);
  const repeat=await reverseScoreByDedupeKey(key,{skipStreak:true},{scoreCache:cache,now:now+3000});
  assert.equal(repeat.reversedUnits,0);
});
test('edited and imported expenses cannot earn stars, delete checks matching expense id',()=>{
  assert.match(finance,/const isNew=!String\(body\.id\|\|''\)\.trim\(\)/);
  assert.match(finance,/const score=newExpense\?\.actor===actor&&!newExpense\.importKey/);
  assert.match(finance,/current\.dedupe\[key\]===expenseId/);
  assert.match(finance,/reverseScoreByDedupeKey\(key/);
  assert.match(finance,/removed&&!removed\.manualAdjustment&&!removed\.importKey/);
  assert.match(app,/if\(data\.score\) renderScoreStickers\(data\.score\)/);
});
test('per-actor startup options valid, car restricted, preference persists through server store',async()=>{
  resetPrefs();
  const expected=['home','finances','supplements','habits','car','schedule','feed','products','photos','fasting'];
  for(const route of expected)assert.ok(app.includes('<option value="'+route+'">'));
  assert.match(app,/carOption\.disabled=currentActor!=='Рустам'/);
  assert.match(app,/const initialTab=requestedInitialTab\(\)/);
  assert.match(app,/return requestedAppTab\|\|\(route\.tab!=='home'\?route\.tab:currentStartupTab\(\)\)/);
  assert.equal(normalizeUiPreferencesState({startupTab:'nonsense'}).startupTab,'home');
  assert.equal(normalizeUiPreferencesState({startupTab:'finances'}).startupTab,'finances');
  const cache=memoryCache(),first=await saveUiPreferences('Рустам',{startupTab:'car'},{uiPreferencesCache:cache});
  assert.equal(first.startupTab,'car');
  const next=await saveUiPreferences('Диана',{startupTab:'car'},{uiPreferencesCache:memoryCache()});
  assert.equal(next.startupTab,'home');
  assert.match(prefsSource,/syncSchemaVersion: 10/);
});
test('scripts are parseable',()=>{
  assert.doesNotThrow(()=>new Function(app));
  assert.doesNotThrow(()=>new Function(finance));
  assert.doesNotThrow(()=>new Function(prefsSource));
});
