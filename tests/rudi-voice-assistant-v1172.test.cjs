const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');

const app=fs.readFileSync('public/app.js','utf8');
const css=fs.readFileSync('public/app.css','utf8');
const voice=fs.readFileSync('api/voice-assistant.cjs','utf8');
const context=fs.readFileSync('api/voice-assistant-rudi.cjs','utf8');
const smart=fs.readFileSync('api/smart-home-client.cjs','utf8');

test('assistant opens idle and voice is opt-in',()=>{
  assert.match(app,/voiceAssistantVoiceToggle/);
  assert.match(app,/let voiceAssistantVoiceEnabled = false/);
  const start=app.indexOf("fab.addEventListener('click'");
  const block=app.slice(start,start+350);
  assert.doesNotMatch(block,/startVoiceAssistantRecording\(\)/);
  assert.match(app,/function setVoiceAssistantVoiceEnabled\(enabled\)/);
});

test('assistant history blocks page pull refresh on iPhone',()=>{
  assert.match(app,/closest\?\.\('\.voice-assistant-panel,\[data-no-pull-refresh="true"\]'\)/);
  assert.match(css,/\.voice-assistant-dialogue\{[^}]*overscroll-behavior-y:contain/);
  assert.match(css,/\.voice-assistant-dialogue\{[^}]*-webkit-overflow-scrolling:touch/);
});

test('speech synthesis is sequential and opt-in',()=>{
  assert.match(app,/if\(!voiceAssistantVoiceEnabled\|\|!/);
  assert.match(app,/utterance\.volume=1/);
  assert.match(app,/synth\.resume\?\.\(\)/);
  assert.match(app,/setTimeout\(next,40\)/);
});

test('silence is filtered before chat response',()=>{
  assert.match(voice,/verbose_json/);
  assert.match(voice,/no_speech_prob/);
  assert.match(voice,/voice-no-speech/);
});

test('assistant context uses RUDI sources requested by the app',()=>{
  assert.match(context,/readDailyMood/);
  assert.match(context,/readProductList/);
  assert.match(context,/readWishlist/);
  assert.match(context,/cycleViewForDate/);
  assert.match(context,/readPartnerMessage/);
  assert.match(context,/readFeedSnapshot/);
  assert.match(context,/readLuluState/);
  assert.match(context,/readCarState/);
  assert.match(context,/getWorkWeek/);
  assert.match(context,/getHolidayCalendar/);
  assert.match(context,/readMarketTicker/);
  assert.match(context,/readSmartHomeSnapshot/);
  assert.match(context,/fetchProjectData/);
  assert.match(context,/make:'Changan',model:'UNI-V',year:2023/);
});

test('assistant smart-home actions go through safe device switch helper',()=>{
  assert.match(context,/selectDevice/);
  assert.match(context,/switchSmartHomeDevice/);
  assert.match(smart,/async function switchSmartHomeDevice/);
  assert.match(smart,/module\.exports = \{ handleSmartHomeRequest, readSmartHomeSnapshot: home, switchSmartHomeDevice, runSmartHomeCapability \}/);
});

test('calendar and holiday routing rules are explicit',()=>{
  assert.match(context,/calendar:.*диан\.\*работ|calendar:broadToday/);
  assert.match(context,/holidays:broadToday/);
  assert.match(context,/getWorkWeek/);
  assert.match(context,/getHolidayCalendar/);
  assert.match(voice,/На вопросы о работе Дианы отвечай по workCalendar/);
  assert.match(voice,/На вопросы о праздниках — только по holidays/);
});
