const test = require('node:test');
const assert = require('node:assert/strict');
const {
  queueForDiMessage,
  queueForDiTelegramRequest,
  readForDiMessages,
  hasQueuedForDiSource,
  publishForDiToRudi,
} = require('../api/for-di-private.cjs');
const { readForDiFeed } = require('../api/for-di-feed-store.cjs');

function memoryCache() {
  const data = new Map();
  return {
    async get(key) { return data.has(key) ? structuredClone(data.get(key)) : null; },
    async set(key, value) { data.set(key, structuredClone(value)); return true; },
    async delete(key) { data.delete(key); return true; },
  };
}

test('For Di publishes queued labor only into RUDI and never sends a Telegram DM', async () => {
  const cache = memoryCache();
  const feedCache = memoryCache();
  const now = new Date('2026-09-22T08:30:00Z');

  await queueForDiMessage('Трудовой кодекс', { now, forDiCache: cache, source:'labor', parseMode:false });
  await queueForDiMessage('Не для публикации', { now, forDiCache: cache, source:'stylist', parseMode:false });

  let telegramCalls=0;
  const result = await publishForDiToRudi({
    now,
    forDiCache: cache,
    forDiFeedCache: feedCache,
    fetchImpl: async()=>{ telegramCalls+=1; throw new Error('telegram-must-not-be-called'); },
  });

  assert.equal(result.sent,0);
  assert.equal(result.telegramDelivery,false);
  assert.equal(result.published,1);
  assert.equal(telegramCalls,0);

  const feed=await readForDiFeed({forDiFeedCache:feedCache});
  assert.equal(feed.items.length,1);
  assert.equal(feed.items[0].text,'Трудовой кодекс');
});

test('only Telegram messages targeting topic 126 enter the RUDI For Di queue', async () => {
  const cache = memoryCache();
  const now = new Date('2026-09-22T08:00:00Z');
  const input = 'https://api.telegram.org/bot123:test/sendMessage';

  await queueForDiTelegramRequest(input, {
    body: JSON.stringify({ chat_id:-1001, message_thread_id:126, text:'Для Ди' }),
  }, { now, forDiCache:cache, source:'labor' });

  await queueForDiTelegramRequest(input, {
    body: JSON.stringify({ chat_id:-1001, message_thread_id:72, text:'Не для Ди' }),
  }, { now, forDiCache:cache, source:'labor' });

  const queued=await readForDiMessages({now,forDiCache:cache});
  assert.equal(queued.messages.length,1);
  assert.equal(queued.messages[0].text,'Для Ди');
});

test('For Di plain-text entries stay plain inside the RUDI section without Telegram delivery', async () => {
  const cache = memoryCache();
  const feedCache = memoryCache();
  const now = new Date('2026-09-23T07:00:00Z');

  await queueForDiMessage('Клиент написал: пример', {
    now,
    forDiCache: cache,
    parseMode: false,
    source: 'labor',
  });

  let telegramCalls=0;
  const result=await publishForDiToRudi({
    now,
    forDiCache:cache,
    forDiFeedCache:feedCache,
    fetchImpl:async()=>{telegramCalls+=1;throw new Error('telegram-must-not-be-called')},
  });

  assert.equal(result.sent,0);
  assert.equal(telegramCalls,0);
  const feed=await readForDiFeed({forDiFeedCache:feedCache});
  assert.equal(feed.items[0].text,'Клиент написал: пример');
});

test('For Di RUDI publication surfaces storage failures without falling back to Telegram', async () => {
  const cache=memoryCache();
  const now=new Date('2026-09-23T07:00:00Z');
  await queueForDiMessage('Трудовой кодекс',{now,forDiCache:cache,source:'labor',parseMode:false});

  let telegramCalls=0;
  const brokenFeedCache={
    async get(){return null},
    async set(){throw new Error('feed-store-unavailable')},
  };

  await assert.rejects(
    ()=>publishForDiToRudi({
      now,
      forDiCache:cache,
      forDiFeedCache:brokenFeedCache,
      fetchImpl:async()=>{telegramCalls+=1;throw new Error('telegram-must-not-be-called')},
    }),
    /feed-store-unavailable/
  );
  assert.equal(telegramCalls,0);
});

test('For Di queue can detect whether today already has a stylist status', async () => {
  const cache=memoryCache();
  const now=new Date('2026-09-23T07:00:00Z');
  assert.equal(await hasQueuedForDiSource(['stylist','stylist-empty'],{now,forDiCache:cache}),false);
  await queueForDiMessage('Трудовой кодекс',{now,forDiCache:cache,source:'labor',parseMode:false});
  assert.equal(await hasQueuedForDiSource(['stylist','stylist-empty'],{now,forDiCache:cache}),false);
  await queueForDiMessage('Новых запросов нет',{now,forDiCache:cache,source:'stylist-empty',parseMode:false});
  assert.equal(await hasQueuedForDiSource(['stylist','stylist-empty'],{now,forDiCache:cache}),true);
});

test('For Di publishes on the same daily run as Feed and has no separate cron', () => {
  const fs=require('node:fs');
  const path=require('node:path');
  const config=JSON.parse(fs.readFileSync(path.join(__dirname,'..','vercel.json'),'utf8'));

  assert.equal(config.crons.some((row)=>row.path==='/api/for-di'),false);
  assert.deepEqual(
    config.crons.find((row)=>row.path==='/api/daily'),
    {path:'/api/daily',schedule:'30 21 * * *'}
  );

  const source=fs.readFileSync(path.join(__dirname,'..','api','daily-orchestrator.cjs'),'utf8');
  assert.match(source,/updateFeedFromRun/);
  assert.match(source,/publishForDiToRudi/);
  assert.match(source,/nativeResults\.forDi/);
});
