const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');

const {
  contextNeeds,
  effectiveTopicText,
  moodForAssistant,
  navigationIntent,
  matchNamedItem,
  removeProductIntent,
  removeWishIntent,
}=require('../api/voice-assistant-rudi.cjs');
const {stripPresentationMarkup}=require('../api/voice-assistant.cjs');
const {observeCameraStatus}=require('../api/smart-home-client.cjs');

test('internal mood codes are translated before Groq sees them',()=>{
  assert.deepEqual(moodForAssistant({mood:'joy',updatedAt:'2026-09-24T10:00:00Z'}),{
    value:'радость',
    updatedAt:'2026-09-24T10:00:00Z',
  });
  assert.equal(moodForAssistant({mood:'sadness'}).value,'грусть');
});

test('assistant strips accidental HTML and markdown presentation tags',()=>{
  assert.equal(stripPresentationMarkup('<b>Ответ</b><br>**готов**'),'Ответ\nготов');
  assert.equal(stripPresentationMarkup('[Открыть](https://example.com)'),'Открыть');
});

test('short follow-ups inherit the previous user topic',()=>{
  const text=effectiveTopicText('а завтра?',[
    {role:'user',content:'Какая погода сегодня?'},
    {role:'assistant',content:'Сегодня ясно.'},
  ]);
  assert.match(text,/какая погода сегодня/);
  assert.match(text,/а завтра/);
  assert.equal(contextNeeds('а завтра?',{
    history:[{role:'user',content:'Какая погода сегодня?'}],
  }).weather,true);
});

test('current app tab provides context for "что здесь"',()=>{
  assert.equal(contextNeeds('что здесь',{ui:{tab:'products'}}).products,true);
  assert.equal(contextNeeds('что здесь',{ui:{tab:'wishlist'}}).wishlist,true);
  assert.equal(contextNeeds('что здесь',{ui:{tab:'feed'}}).feed,true);
  assert.equal(contextNeeds('что здесь',{ui:{tab:'saves'}}).saves,true);
  assert.equal(contextNeeds('что здесь',{ui:{tab:'for-di'}}).forDi,true);
});

test('voice navigation recognizes main RUDI sections',()=>{
  assert.deepEqual(navigationIntent('Открой вишлист'),{tab:'wishlist',label:'вишлист'});
  assert.deepEqual(navigationIntent('Перейди в продукты'),{tab:'products',label:'продукты'});
  assert.deepEqual(navigationIntent('Покажи график'),{tab:'schedule',label:'график'});
  assert.deepEqual(navigationIntent('Открой для Дианы'),{tab:'for-di',label:'для Ди'});
});

test('delete parsers are explicit and ambiguous names are not guessed',()=>{
  assert.deepEqual(removeProductIntent('Удали молоко из продуктов'),{target:'молоко'});
  assert.deepEqual(removeWishIntent('Удали AirPods из вишлиста'),{target:'AirPods'});
  const ambiguous=matchNamedItem([
    {id:'1',text:'Молоко 2.5%'},
    {id:'2',text:'Молоко безлактозное'},
  ],'молоко');
  assert.equal(ambiguous.item,null);
  assert.equal(ambiguous.candidates.length,2);
});

test('client carries UI context, time labels, cleanup and global assistant state',()=>{
  const app=fs.readFileSync('public/app.js','utf8');
  const css=fs.readFileSync('public/app.css','utf8');
  assert.match(app,/ui:\{tab:currentAppTab,selectedDate:currentSelectedWorkDate\|\|''\}/);
  assert.match(app,/function voiceAssistantTimeLabel/);
  assert.match(app,/function cleanVoiceAssistantText/);
  assert.match(app,/fab\.hidden=false/);
  assert.doesNotMatch(app,/if\(!home&&panel&&!panel\.hidden\) closeVoiceAssistant/);
  assert.match(css,/rudiVoiceAnswerIn \.5s/);
});

test('wishlist deletion is owner-only in UI and server',()=>{
  const app=fs.readFileSync('public/app.js','utf8');
  const server=fs.readFileSync('api/partner-message.js','utf8');
  const context=fs.readFileSync('api/voice-assistant-rudi.cjs','utf8');
  assert.match(app,/const canRemove=String\(item\?\.owner\|\|''\)===String\(currentActor\|\|''\)/);
  assert.match(server,/removedItem\.owner !== owner/);
  assert.match(server,/wishlist-owner-forbidden/);
  assert.match(context,/filter\(item=>item\.owner===actor\)/);
});

test('cycle UI contains brain and appetite guidance',()=>{
  const app=fs.readFileSync('public/app.js','utf8');
  const html=fs.readFileSync('public/index.html','utf8');
  assert.match(app,/function dianaCycleBrainNote/);
  assert.match(app,/function dianaCycleAppetiteNote/);
  assert.match(html,/id="dianaCycleBrain"/);
  assert.match(html,/id="dianaCycleAppetite"/);
});

test('camera switch activity is private and status notification targets Rustam only',()=>{
  const smart=fs.readFileSync('api/smart-home-client.cjs','utf8');
  assert.match(smart,/if\(!\/камера\|camera\/iu\.test\(name\)\)/);
  assert.match(smart,/recipients\?\.\['Рустам'\]/);
});

test('camera first observation is silent, later state change sends one Telegram push to Rustam',async()=>{
  const originalFetch=global.fetch;
  const originalToken=process.env.YANDEX_IOT_TOKEN;
  process.env.YANDEX_IOT_TOKEN='test-yandex-token';

  const cameraStatusCache={
    value:null,
    async get(){return this.value},
    async set(_key,value){this.value=value;return true},
  };
  const notificationCache={
    async get(key){
      if(key==='recipient:Рустам') return 160628165;
      return null;
    },
  };
  let telegramCalls=0;
  let lastTelegramBody=null;
  const telegramFetch=async(_url,init)=>{
    telegramCalls+=1;
    lastTelegramBody=JSON.parse(init.body);
    return new Response(JSON.stringify({ok:true,result:{message_id:123}}),{
      status:200,headers:{'content-type':'application/json'}
    });
  };

  try{
    global.fetch=async()=>new Response(JSON.stringify({state:'online'}),{
      status:200,headers:{'content-type':'application/json'}
    });
    const first=await observeCameraStatus({
      devices:[{id:'camera_123456',name:'Камера',type:'devices.types.camera'}],
    },{
      cameraStatusCache,notificationCache,fetchImpl:telegramFetch,
      botToken:'123456:abcdefghijklmnopqrstuvwxyz0123456789',
    });
    assert.equal(first.changed,false);
    assert.equal(telegramCalls,0);

    global.fetch=async()=>new Response(JSON.stringify({state:'offline'}),{
      status:200,headers:{'content-type':'application/json'}
    });
    const second=await observeCameraStatus({
      devices:[{id:'camera_123456',name:'Камера',type:'devices.types.camera'}],
    },{
      cameraStatusCache,notificationCache,fetchImpl:telegramFetch,
      botToken:'123456:abcdefghijklmnopqrstuvwxyz0123456789',
    });
    assert.equal(second.changed,true);
    assert.equal(telegramCalls,1);
    assert.equal(lastTelegramBody.chat_id,160628165);
    assert.match(lastTelegramBody.text,/Камера офлайн/);
  } finally {
    global.fetch=originalFetch;
    if(originalToken===undefined) delete process.env.YANDEX_IOT_TOKEN;
    else process.env.YANDEX_IOT_TOKEN=originalToken;
  }
});
