const test = require('node:test');
const assert = require('node:assert/strict');
const { normalizeHistory, normalizeMimeType, runVoiceAssistant } = require('../api/voice-assistant.cjs');

test('voice assistant keeps only user and assistant history', () => {
  assert.deepEqual(normalizeHistory([
    { role: 'system', content: 'ignore' },
    { role: 'user', content: 'Привет' },
    { role: 'assistant', content: 'Здравствуйте' },
  ]), [
    { role: 'user', content: 'Привет' },
    { role: 'assistant', content: 'Здравствуйте' },
  ]);
});

test('voice assistant accepts Safari and Chromium audio', () => {
  assert.equal(normalizeMimeType('audio/mp4'), 'audio/mp4');
  assert.equal(normalizeMimeType('audio/webm;codecs=opus'), 'audio/webm');
  assert.throws(() => normalizeMimeType('video/mp4'), /voice-audio-type/);
});

test('voice assistant uses Whisper then current Groq chat model', async () => {
  let calls=0;
  const fetchImpl=async(url,init)=>{
    calls++;
    if(String(url).includes('/audio/transcriptions')){
      assert.equal(init.body.get('model'),'whisper-large-v3-turbo');
      assert.equal(init.body.get('language'),'ru');
      return new Response(JSON.stringify({text:'Как дела?'}),{status:200,headers:{'content-type':'application/json'}});
    }
    const body=JSON.parse(init.body);
    assert.equal(body.model,'openai/gpt-oss-20b');
    assert.equal(body.messages.at(-1).content,'Как дела?');
    return new Response(JSON.stringify({choices:[{message:{content:'Всё работает. Чем помочь?'}}]}),{status:200,headers:{'content-type':'application/json'}});
  };
  const result=await runVoiceAssistant({mimeType:'audio/webm',audioBase64:Buffer.alloc(512,7).toString('base64')},{apiKey:'test-key',actor:'Рустам',fetchImpl});
  assert.equal(result.transcript,'Как дела?');
  assert.equal(result.answer,'Всё работает. Чем помочь?');
  assert.equal(calls,2);
});


test('voice assistant accepts typed text without transcription', async () => {
  const calls=[];
  const fetchImpl=async(url,init)=>{
    calls.push(String(url));
    assert.ok(String(url).includes('/chat/completions'));
    const body=JSON.parse(init.body);
    assert.equal(body.messages.at(-1).content,'Напомни купить молоко');
    return new Response(JSON.stringify({choices:[{message:{content:'Добавить молоко в список?'}}]}),{status:200,headers:{'content-type':'application/json'}});
  };
  const result=await runVoiceAssistant({text:'Напомни купить молоко',history:[]},{apiKey:'test-key',actor:'Рустам',fetchImpl});
  assert.equal(result.transcript,'Напомни купить молоко');
  assert.equal(result.answer,'Добавить молоко в список?');
  assert.equal(calls.length,1);
});
