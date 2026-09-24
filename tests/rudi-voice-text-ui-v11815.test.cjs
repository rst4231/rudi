const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');

const html=fs.readFileSync('public/index.html','utf8');
const app=fs.readFileSync('public/app.js','utf8');
const css=fs.readFileSync('public/app.css','utf8');

test('assistant launcher uses the supplied image at the existing 56px footprint',()=>{
  assert.ok(fs.existsSync('public/rudi-voice-assistant.webp'),'assistant image asset must exist');
  assert.match(html,/id="voiceAssistantLauncher"/);
  assert.match(html,/id="voiceAssistantGreeting"/);
  assert.match(html,/rudi-voice-assistant\.webp/);
  assert.match(css,/\.voice-assistant-fab\{[^}]*width:56px[^}]*height:56px/s);
  assert.match(css,/@keyframes voiceAssistantGlow/);
});

test('assistant exposes typed chat while keeping voice output control',()=>{
  assert.match(html,/id="voiceAssistantTextForm"/);
  assert.match(html,/id="voiceAssistantTextInput"/);
  assert.match(html,/id="voiceAssistantTextSend"/);
  assert.match(html,/id="voiceAssistantVoiceToggle"/);
  assert.match(app,/function sendVoiceAssistantText\(/);
  assert.match(app,/rudiAction=voice-assistant/);
});

test('assistant greeting is personal and rotates between app openings',()=>{
  assert.match(app,/function voiceAssistantGreetingText\(/);
  assert.match(app,/currentActor|firstName/);
  assert.match(app,/rudi:voice-greeting/);
  assert.match(app,/как дела\?|чем помочь\?|рассказывай|что делаем\?/i);
});

test('assistant panel follows iPhone visual viewport while typing',()=>{
  assert.match(app,/function updateVoiceAssistantViewport\(/);
  assert.match(app,/window\.visualViewport/);
  assert.match(css,/--voice-assistant-keyboard-inset/);
  assert.match(css,/voice-assistant-input-active/);
});
