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
  assert.match(html,/id="voiceAssistantPanelGreeting"/);
  assert.match(app,/voiceAssistantPanelGreeting/);
});

test('assistant panel follows iPhone visual viewport while typing',()=>{
  assert.match(app,/function updateVoiceAssistantViewport\(/);
  assert.match(app,/window\.visualViewport/);
  assert.match(css,/--voice-assistant-keyboard-inset/);
  assert.match(css,/voice-assistant-input-active/);
});


test('assistant UI presents RUDI as a female assistant',()=>{
  assert.match(html,/AI-помощница RUDI/);
  assert.match(html,/Персональная AI-помощница/);
  assert.match(html,/aria-label="Открыть AI-помощницу"/);
  assert.match(html,/aria-label="AI-помощница RUDI"/);
  assert.doesNotMatch(html,/Голосовой ассистент RUDI/);
});


test('keyboard editing never hides the open assistant panel',()=>{
  assert.doesNotMatch(css,/body\.keyboard-editing \.voice-assistant-panel\s*\{[^}]*display\s*:\s*none/i);
  assert.match(css,/body\.keyboard-editing \.voice-assistant-fab\{display:none!important\}/);
});


test('assistant modal locks the background in Telegram and PWA',()=>{
  assert.match(html,/id="voiceAssistantBackdrop"/);
  assert.match(app,/function lockVoiceAssistantPage\(/);
  assert.match(app,/document\.body\.style\.position='fixed'/);
  assert.match(app,/function unlockVoiceAssistantPage\(/);
  assert.match(css,/body\.voice-assistant-open\{[^}]*overflow:hidden!important/s);
  assert.match(css,/\.voice-assistant-backdrop\{/);
});

test('mobile assistant uses stable visible viewport height instead of keyboard bottom offsets',()=>{
  assert.match(css,/height:calc\(var\(--voice-assistant-viewport-height,100dvh\) - 16px\)!important/);
  assert.doesNotMatch(app,/--voice-assistant-keyboard-inset/);
  assert.doesNotMatch(app,/visualViewport\?\.addEventListener\?\.\('scroll',updateVoiceAssistantViewport/);
});


test('assistant launcher is disabled globally',()=>{
  assert.match(css,/\.voice-assistant-launcher\{display:none!important\}/);
});
