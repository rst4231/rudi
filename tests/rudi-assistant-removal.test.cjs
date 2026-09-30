const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');

test('RUDI AI assistant is fully removed while Alice stays intact',()=>{
  assert.equal(fs.existsSync('api/voice-assistant.cjs'),false);
  assert.equal(fs.existsSync('api/voice-assistant-rudi.cjs'),false);
  assert.equal(fs.existsSync('public/rudi-voice-assistant.webp'),false);

  const app=fs.readFileSync('public/app.js','utf8');
  const css=fs.readFileSync('public/app.css','utf8');
  const html=fs.readFileSync('public/index.html','utf8');
  const api=fs.readFileSync('api/partner-message.js','utf8');
  for(const source of [app,css,html,api]){
    assert.doesNotMatch(source,/voiceAssistant|voice-assistant|rudi-voice-assistant/i);
  }

  assert.equal(fs.existsSync('api/alice-shopping-response.cjs'),true);
  const alice=fs.readFileSync('api/alice-shopping-response.cjs','utf8');
  assert.match(alice,/alice|shopping|product/i);
});

test('default home layout keeps Saves directly after Question of the Day',()=>{
  const app=fs.readFileSync('public/app.js','utf8');
  assert.match(app,/'daily-question','smart-saves','markets'/);
  assert.match(app,/migrateLegacyDefaultSavesOrder/);
});

test('Question of the Day and Saves titles share the same heading scale',()=>{
  const css=fs.readFileSync('public/app.css','utf8');
  assert.match(css,/#dailyQuestionTitle,[\s\S]*#smartSavesHomeTitle[\s\S]*font-size:18px!important/);
});

test('car page keeps modern visual refresh without changing car runtime module',()=>{
  const css=fs.readFileSync('public/app.css','utf8');
  const car=fs.readFileSync('public/car.js','utf8');
  assert.match(css,/modern car visual refresh/);
  assert.match(css,/#carTile\.car-card/);
  assert.match(car,/const API = '\/api\/index\?route=car'/);
});
