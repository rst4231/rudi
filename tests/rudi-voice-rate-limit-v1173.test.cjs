const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const { contextNeeds }=require('../api/voice-assistant-rudi.cjs');
const { answerTranscript, transcribeAudio }=require('../api/voice-assistant.cjs');

test('voice context routes simple questions to only relevant RUDI domains',()=>{
  const market=contextNeeds('Какой сейчас курс доллара?');
  assert.equal(market.market,true);
  assert.equal(market.products,false);
  assert.equal(market.smart,false);
  assert.equal(market.feed,false);

  const products=contextNeeds('В списке продуктов есть молоко?');
  assert.equal(products.products,true);
  assert.equal(products.market,false);
  assert.equal(products.calendar,false);

  const calendar=contextNeeds('Диана сегодня работает?');
  assert.equal(calendar.calendar,true);
  assert.equal(calendar.products,false);
  assert.equal(calendar.market,false);

  const holidays=contextNeeds('Какие сегодня праздники?');
  assert.equal(holidays.holidays,true);
  assert.equal(holidays.feed,false);

  const smart=contextNeeds('Включи торшер');
  assert.equal(smart.smart,true);
  assert.equal(smart.products,false);
});

test('voice context no longer preloads all RUDI stores for every request',()=>{
  const source=fs.readFileSync('api/voice-assistant-rudi.cjs','utf8');
  const fn=source.slice(source.indexOf('async function readAssistantContext'),source.indexOf('async function executeAssistantAction'));
  assert.doesNotMatch(fn,/Promise\.all\(\[\s*readDailyMood[\s\S]*readActivityJournal/);
  assert.match(fn,/if\(wanted\.products\|\|wanted\.productHistory\)/);
  assert.match(fn,/if\(wanted\.calendar\)/);
  assert.match(fn,/if\(wanted\.market\)/);
  assert.match(fn,/if\(wanted\.smart\)/);
});

test('chat payload is capped to reduce Groq token pressure',()=>{
  const source=fs.readFileSync('api/voice-assistant.cjs','utf8');
  assert.match(source,/const MAX_HISTORY_MESSAGES = 6/);
  assert.match(source,/cleanText\(item\?\.content, 800\)/);
  assert.match(source,/JSON\.stringify\(options\.context\)\.slice\(0, 7000\)/);
  assert.match(source,/max_completion_tokens: 280/);
  assert.match(source,/reasoning_effort: options\.actionResult \? 'low' : 'medium'/);
});

test('chat 429 exposes temporary retry delay',async()=>{
  const fetchImpl=async()=>new Response(JSON.stringify({error:'rate'}),{
    status:429,
    headers:{'retry-after':'17','content-type':'application/json'},
  });
  await assert.rejects(
    ()=>answerTranscript('Привет',[],{apiKey:'test',fetchImpl}),
    error=>{
      assert.equal(error.message,'voice-chat-rate-limit');
      assert.equal(error.retryAfterSeconds,17);
      return true;
    }
  );
});

test('speech recognition 429 exposes temporary retry delay',async()=>{
  const fetchImpl=async()=>new Response(JSON.stringify({error:'rate'}),{
    status:429,
    headers:{'retry-after':'9','content-type':'application/json'},
  });
  await assert.rejects(
    ()=>transcribeAudio(Buffer.alloc(512,1),'audio/webm',{apiKey:'test',fetchImpl}),
    error=>{
      assert.equal(error.message,'voice-stt-rate-limit');
      assert.equal(error.retryAfterSeconds,9);
      return true;
    }
  );
});

test('client no longer says free Groq limit is exhausted',()=>{
  const app=fs.readFileSync('public/app.js','utf8');
  assert.doesNotMatch(app,/Бесплатный лимит Groq временно исчерпан/);
  assert.match(app,/Слишком много запросов подряд/);
  assert.match(app,/retryAfterSeconds/);
});
