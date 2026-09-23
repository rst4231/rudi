const test = require('node:test');
const assert = require('node:assert/strict');

let api = {};
try { api = require('../api/stylist-leads.cjs'); } catch {}

test('extractTelegramPosts parses post id, text, datetime and link', () => {
  assert.equal(typeof api.extractTelegramPosts, 'function');
  const html = `
    <div class="tgme_widget_message_wrap js-widget_message_wrap">
      <div class="tgme_widget_message text_not_supported_wrap js-widget_message" data-post="spbeventjob/12345">
        <div class="tgme_widget_message_text js-message_text" dir="auto">Ищу <b>стилиста</b> по одежде<br>СПб</div>
        <time datetime="2026-09-13T03:30:00+00:00"></time>
      </div>
    </div>`;
  const [post] = api.extractTelegramPosts(html, { id: 'event', handle: 'spbeventjob', title: 'Event Hunter' });
  assert.equal(post.id, '12345');
  assert.equal(post.text, 'Ищу стилиста по одежде\nСПб');
  assert.equal(post.datetime, '2026-09-13T03:30:00+00:00');
  assert.equal(post.link, 'https://t.me/spbeventjob/12345');
});

test('scoreStylistLead marks direct clothing stylist request as hot', () => {
  assert.equal(typeof api.scoreStylistLead, 'function');
  const result = api.scoreStylistLead('Санкт-Петербург. Ищу стилиста по одежде, нужно разобрать гардероб и подобрать образы.');
  assert.equal(result.score, 3);
  assert.match(result.reason, /прям/i);
});

test('scoreStylistLead rejects hair stylist request without clothing context', () => {
  const result = api.scoreStylistLead('Ищу стилиста по волосам и визажиста на завтра в СПб');
  assert.equal(result.score, 0);
});

test('scoreStylistLead rejects retail stylist vacancy', () => {
  const result = api.scoreStylistLead('В магазин одежды требуется продавец-стилист, график 2/2');
  assert.equal(result.score, 0);
});

test('scoreStylistLead accepts wardrobe and shopping assistance requests', () => {
  assert.equal(api.scoreStylistLead('Посоветуйте, кто делает разбор гардероба в Петербурге?').score, 3);
  assert.equal(api.scoreStylistLead('Нужна помощь собрать капсулу и подобрать вещи на осень').score >= 2, true);
});

test('filterFreshLeads keeps only fresh relevant unseen posts and sorts hot first', async () => {
  assert.equal(typeof api.filterFreshLeads, 'function');
  const now = new Date('2026-09-13T04:00:00Z');
  const posts = [
    { source: { id: 'a', priority: 10 }, id: '1', text: 'Нужно подобрать вещи, собрать капсулу', datetime: '2026-09-13T02:00:00Z', link: 'https://t.me/a/1' },
    { source: { id: 'b', priority: 100 }, id: '2', text: 'Ищу стилиста по одежде в СПб', datetime: '2026-09-13T03:00:00Z', link: 'https://t.me/b/2' },
    { source: { id: 'c', priority: 100 }, id: '3', text: 'Ищу стилиста по одежде', datetime: '2026-09-10T03:00:00Z', link: 'https://t.me/c/3' },
  ];
  const seen = new Set([api.leadFingerprint(posts[0])]);
  const leads = await api.filterFreshLeads(posts, { now, lookbackHours: 30, seenFingerprints: seen });
  assert.deepEqual(leads.map((lead) => lead.id), ['2']);
});

test('formatLeadMessage contains source, request and original link', () => {
  assert.equal(typeof api.formatLeadMessage, 'function');
  const text = api.formatLeadMessage({
    source: { title: 'Event Hunter' }, id: '10', text: 'Ищу стилиста по одежде для разбора гардероба', link: 'https://t.me/spbeventjob/10', datetime: '2026-09-13T03:00:00Z', score: 3, reason: 'прямой запрос на стилиста по одежде',
  });
  assert.match(text, /Новый клиент для стилиста/);
  assert.match(text, /Event Hunter/);
  assert.match(text, /Ищу стилиста/);
  assert.match(text, /https:\/\/t\.me\/spbeventjob\/10/);
});

test('scanStylistSources tolerates a failed source and returns posts from healthy sources', async () => {
  assert.equal(typeof api.scanStylistSources, 'function');
  const config = { sources: [
    { id: 'ok', handle: 'ok', title: 'OK', enabled: true },
    { id: 'bad', handle: 'bad', title: 'BAD', enabled: true },
  ] };
  const fetchImpl = async (url) => {
    if (url.includes('/bad')) return new Response('no', { status: 500 });
    return new Response(`<div class="tgme_widget_message_wrap"><div class="tgme_widget_message" data-post="ok/7"><div class="tgme_widget_message_text js-message_text">Ищу стилиста по одежде</div><time datetime="2026-09-13T03:00:00Z"></time></div></div>`, { status: 200 });
  };
  const result = await api.scanStylistSources(config, { fetchImpl, concurrency: 2 });
  assert.equal(result.posts.length, 1);
  assert.equal(result.errors.length, 1);
});

test('loadStylistLeadsConfig prefers valid remote config and falls back to local', async () => {
  assert.equal(typeof api.loadStylistLeadsConfig, 'function');
  const local = { version: 1, enabled: true, topicId: 126, sources: [{ id: 'local', handle: 'local', title: 'Local', city: 'Санкт-Петербург' }] };
  const remote = { version: 1, enabled: true, topicId: 126, sources: [{ id: 'remote', handle: 'remote', title: 'Remote', city: 'Санкт-Петербург' }] };
  const loaded = await api.loadStylistLeadsConfig({
    localConfig: local,
    configUrl: 'https://example.test/stylist.json',
    fetchImpl: async () => new Response(JSON.stringify(remote), { status: 200, headers: { 'content-type': 'application/json' } }),
  });
  assert.equal(loaded.sources[0].id, 'remote');

  const fallback = await api.loadStylistLeadsConfig({
    localConfig: local,
    configUrl: 'https://example.test/stylist.json',
    fetchImpl: async () => new Response('no', { status: 500 }),
  });
  assert.equal(fallback.sources[0].id, 'local');
});

test('runStylistLeads sends only unseen leads to Diana topic and marks them after send', async () => {
  assert.equal(typeof api.runStylistLeads, 'function');
  const config = {
    version: 1, enabled: true, topicId: 126, lookbackHours: 30, maxLeadsPerRun: 5, sendEmpty: true,
    sources: [{ id: 'event', handle: 'spbeventjob', title: 'Event Hunter', city: 'Санкт-Петербург', enabled: true, priority: 100 }],
  };
  const posts = [
    { source: config.sources[0], id: '1', text: 'Ищу стилиста по одежде в СПб', datetime: '2026-09-13T03:00:00Z', link: 'https://t.me/spbeventjob/1' },
    { source: config.sources[0], id: '2', text: 'Ищу стилиста по одежде, нужен разбор гардероба', datetime: '2026-09-13T03:30:00Z', link: 'https://t.me/spbeventjob/2' },
  ];
  const alreadySeen = api.leadFingerprint(posts[0]);
  const cacheRows = new Map([[`seen:${alreadySeen}`, { sentAt: 'before' }]]);
  const cache = {
    async get(key) { return cacheRows.get(key) ?? null; },
    async set(key, value) { cacheRows.set(key, value); return true; },
  };
  const sent = [];
  const result = await api.runStylistLeads({
    now: new Date('2026-09-13T04:00:00Z'),
    config,
    cache,
    chatId: '-1001234567890',
    scanImpl: async () => ({ posts, errors: [], sourcesChecked: 1 }),
    sendMessage: async (payload) => { sent.push(payload); return { ok: true }; },
  });
  assert.equal(result.leadsSent, 1);
  assert.equal(sent.length, 1);
  assert.equal(sent[0].message_thread_id, 126);
  assert.equal(sent[0].chat_id, '-1001234567890');
  assert.match(sent[0].text, /spbeventjob\/2/);
  assert.notEqual(cacheRows.get(`seen:${api.leadFingerprint(posts[1])}`), undefined);
});

test('runStylistLeads sends one quiet summary when no new leads exist', async () => {
  const config = { version: 1, enabled: true, topicId: 126, lookbackHours: 30, maxLeadsPerRun: 5, sendEmpty: true, sources: [] };
  const sent = [];
  const result = await api.runStylistLeads({
    now: new Date('2026-09-13T04:00:00Z'),
    config,
    cache: { async get() { return null; }, async set() { return true; } },
    chatId: '-1001234567890',
    scanImpl: async () => ({ posts: [], errors: [], sourcesChecked: 0 }),
    sendMessage: async (payload) => { sent.push(payload); },
  });
  assert.equal(result.leadsSent, 0);
  assert.equal(result.emptyNoticeSent, true);
  assert.equal(sent.length, 1);
  assert.equal(sent[0].message_thread_id, 126);
  assert.match(sent[0].text, /новых запросов/i);
});

test('runStylistLeads does not mark a lead seen when Telegram send fails', async () => {
  const config = { version: 1, enabled: true, topicId: 126, lookbackHours: 30, maxLeadsPerRun: 5, sendEmpty: true, sources: [] };
  const post = { source: { id: 'event', title: 'Event' }, id: '9', text: 'Ищу стилиста по одежде', datetime: '2026-09-13T03:00:00Z', link: 'https://t.me/event/9' };
  const writes = [];
  await assert.rejects(() => api.runStylistLeads({
    now: new Date('2026-09-13T04:00:00Z'),
    config,
    cache: { async get() { return null; }, async set(...args) { writes.push(args); return true; } },
    chatId: '-1001234567890',
    scanImpl: async () => ({ posts: [post], errors: [], sourcesChecked: 1 }),
    sendMessage: async () => { throw new Error('Telegram down'); },
  }), /Telegram down/);
  assert.equal(writes.some(([key]) => key.startsWith('seen:')), false);
});

test('leadFingerprint deduplicates the same request reposted by different sources', () => {
  const left = { source: { id: 'a' }, id: '10', text: 'Ищу стилиста по одежде. Нужен разбор гардероба', link: 'https://t.me/a/10' };
  const right = { source: { id: 'b' }, id: '99', text: 'Ищу стилиста по одежде. Нужен разбор гардероба', link: 'https://t.me/b/99' };
  assert.equal(api.leadFingerprint(left), api.leadFingerprint(right));
});

test('scoreStylistLead rejects an explicitly Moscow-only request', () => {
  const result = api.scoreStylistLead('Москва. Ищу стилиста по одежде, нужен разбор гардероба. Только офлайн в Москве.');
  assert.equal(result.score, 0);
});

test('scanStylistSources paginates backwards so high-volume channels do not lose daily posts', async () => {
  const config = {
    lookbackHours: 30,
    maxPagesPerSource: 3,
    sources: [{ id: 'event', handle: 'event', title: 'Event', enabled: true }],
  };
  const calls = [];
  const page = (posts) => posts.map(({ id, text, dt }) => `<div class="tgme_widget_message" data-post="event/${id}"><div class="tgme_widget_message_text js-message_text">${text}</div><time datetime="${dt}"></time></div>`).join('');
  const fetchImpl = async (url) => {
    calls.push(String(url));
    if (!String(url).includes('before=')) return new Response(page([
      { id: 100, text: 'Ищу стилиста по одежде', dt: '2026-09-13T03:00:00Z' },
      { id: 101, text: 'Просто пост', dt: '2026-09-13T03:30:00Z' },
    ]), { status: 200 });
    return new Response(page([
      { id: 80, text: 'Нужен разбор гардероба', dt: '2026-09-11T21:00:00Z' },
      { id: 81, text: 'Ищу стилиста по одежде', dt: '2026-09-12T23:00:00Z' },
    ]), { status: 200 });
  };
  const result = await api.scanStylistSources(config, { fetchImpl, now: new Date('2026-09-13T04:00:00Z'), concurrency: 1 });
  assert.equal(calls.length, 2);
  assert.equal(calls[1].includes('before=100'), true);
  assert.equal(result.posts.some((post) => post.id === '81'), true);
});

test('scoreStylistLead accepts externally configured phrases and respects external blocks', () => {
  const custom = api.scoreStylistLead('СПб. Нужен фэшн-помощник на разбор вещей', {
    positivePhrases: ['фэшн-помощник'],
  });
  assert.equal(custom.score >= 2, true);
  const blocked = api.scoreStylistLead('СПб. Ищу стилиста по одежде. тест-стоп', {
    blockedPhrases: ['тест-стоп'],
  });
  assert.equal(blocked.score, 0);
});

test('runStylistLeads does not send a false empty notice when every source failed', async () => {
  const config = { version: 1, enabled: true, topicId: 126, lookbackHours: 30, maxLeadsPerRun: 5, sendEmpty: true, sources: [{ id: 'a', handle: 'a', title: 'A' }, { id: 'b', handle: 'b', title: 'B' }] };
  const sent = [];
  await assert.rejects(() => api.runStylistLeads({
    now: new Date('2026-09-13T04:00:00Z'),
    config,
    cache: { async get() { return null; }, async set() { return true; } },
    chatId: '-1001234567890',
    scanImpl: async () => ({ posts: [], errors: [{ source: config.sources[0], error: 'HTTP 500' }, { source: config.sources[1], error: 'HTTP 500' }], sourcesChecked: 2 }),
    sendMessage: async (payload) => { sent.push(payload); },
  }), /all stylist lead sources failed/i);
  assert.equal(sent.length, 0);
});


test('runStylistLeads queues each lead for Diana private delivery before topic publication', async () => {
  const config = {
    version:1,enabled:true,topicId:126,lookbackHours:30,maxLeadsPerRun:5,sendEmpty:true,
    sources:[{id:'event',handle:'event',title:'Event',city:'Санкт-Петербург',enabled:true,priority:100}],
  };
  const post={source:config.sources[0],id:'77',text:'Ищу стилиста по одежде в СПб <срочно>',datetime:'2026-09-23T03:00:00Z',link:'https://t.me/event/77'};
  const order=[];
  const queued=[];
  const sent=[];
  const result=await api.runStylistLeads({
    now:new Date('2026-09-23T04:00:00Z'),
    config,
    cache:{async get(){return null},async set(){return true}},
    chatId:'-1001234567890',
    scanImpl:async()=>({posts:[post],errors:[],sourcesChecked:1}),
    queueForDiMessageImpl:async(text,options)=>{order.push('queue');queued.push({text,options});return {text}},
    sendMessage:async(payload)=>{order.push('send');sent.push(payload);return {ok:true}},
  });
  assert.deepEqual(order,['queue','send']);
  assert.equal(result.privateQueued,1);
  assert.equal(queued.length,1);
  assert.equal(queued[0].options.parseMode,false);
  assert.equal(queued[0].options.source,'stylist');
  assert.match(queued[0].text,/event\/77/);
  assert.equal(sent.length,1);
});

test('runStylistLeads queues the empty stylist notice for Diana too', async () => {
  const config={version:1,enabled:true,topicId:126,lookbackHours:30,maxLeadsPerRun:5,sendEmpty:true,sources:[]};
  const queued=[];
  const result=await api.runStylistLeads({
    now:new Date('2026-09-23T04:00:00Z'),
    config,
    cache:{async get(){return null},async set(){return true}},
    chatId:'-1001234567890',
    scanImpl:async()=>({posts:[],errors:[],sourcesChecked:0}),
    queueForDiMessageImpl:async(text,options)=>{queued.push({text,options});return {text}},
    sendMessage:async()=>({ok:true}),
  });
  assert.equal(result.privateQueued,1);
  assert.equal(queued.length,1);
  assert.equal(queued[0].options.source,'stylist-empty');
  assert.equal(queued[0].options.parseMode,false);
  assert.match(queued[0].text,/новых запросов/i);
});

test('runStylistLeads does not publish to the topic if Diana private queue write fails', async () => {
  const config={version:1,enabled:true,topicId:126,lookbackHours:30,maxLeadsPerRun:5,sendEmpty:true,sources:[]};
  const post={source:{id:'event',title:'Event'},id:'88',text:'Ищу стилиста по одежде в СПб',datetime:'2026-09-23T03:00:00Z',link:'https://t.me/event/88'};
  let topicCalls=0;
  await assert.rejects(()=>api.runStylistLeads({
    now:new Date('2026-09-23T04:00:00Z'),
    config,
    cache:{async get(){return null},async set(){return true}},
    chatId:'-1001234567890',
    scanImpl:async()=>({posts:[post],errors:[],sourcesChecked:1}),
    queueForDiMessageImpl:async()=>{throw new Error('private queue down')},
    sendMessage:async()=>{topicCalls+=1;return {ok:true}},
  }),/private queue down/);
  assert.equal(topicCalls,0);
});


test('private-only stylist catch-up queues recent leads without publishing or consulting seen markers', async () => {
  const config={
    version:1,enabled:true,topicId:126,lookbackHours:30,maxLeadsPerRun:5,sendEmpty:true,
    sources:[{id:'event',handle:'event',title:'Event',city:'Санкт-Петербург',enabled:true,priority:100}],
  };
  const post={source:config.sources[0],id:'99',text:'Ищу стилиста по одежде в СПб',datetime:'2026-09-23T03:00:00Z',link:'https://t.me/event/99'};
  const queued=[];
  let topicCalls=0;
  let seenReads=0;
  const result=await api.runStylistLeads({
    now:new Date('2026-09-23T09:00:00Z'),
    config,
    privateOnly:true,
    forcePrivateSummary:true,
    cache:{async get(){seenReads+=1;return {sentAt:'before'}},async set(){return true}},
    scanImpl:async()=>({posts:[post],errors:[],sourcesChecked:1}),
    queueForDiMessageImpl:async(text,options)=>{queued.push({text,options});return {text}},
    sendMessage:async()=>{topicCalls+=1;return {ok:true}},
  });
  assert.equal(result.privateOnly,true);
  assert.equal(result.privateQueued,1);
  assert.equal(queued.length,1);
  assert.equal(queued[0].options.source,'stylist');
  assert.equal(topicCalls,0);
  assert.equal(seenReads,0);
});

test('private-only stylist catch-up always queues an empty daily status when forced', async () => {
  const config={version:1,enabled:true,topicId:126,lookbackHours:30,maxLeadsPerRun:5,sendEmpty:false,sources:[]};
  const queued=[];
  const result=await api.runStylistLeads({
    now:new Date('2026-09-23T09:00:00Z'),
    config,
    privateOnly:true,
    forcePrivateSummary:true,
    scanImpl:async()=>({posts:[],errors:[],sourcesChecked:0}),
    queueForDiMessageImpl:async(text,options)=>{queued.push({text,options});return {text}},
  });
  assert.equal(result.privateEmptyQueued,true);
  assert.equal(result.privateQueued,1);
  assert.equal(queued[0].options.source,'stylist-empty');
});
