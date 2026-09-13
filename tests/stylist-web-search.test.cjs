const test = require('node:test');
const assert = require('node:assert/strict');

let webApi = {};
try { webApi = require('../api/stylist-web-search.cjs'); } catch {}

function tavilyResponse(results = []) {
  return new Response(JSON.stringify({
    query: 'test',
    results,
    usage: { credits: 1 },
  }), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  });
}

test('scanTavilyStylistLeads uses a basic 24h search and maps fresh web results', async () => {
  assert.equal(typeof webApi.scanTavilyStylistLeads, 'function');
  const calls = [];
  const config = {
    webSearch: {
      enabled: true,
      searchDepth: 'basic',
      timeRange: 'day',
      maxResults: 8,
      queries: ['Санкт-Петербург ищу стилиста по одежде'],
    },
  };
  const result = await webApi.scanTavilyStylistLeads(config, {
    env: { TAVILY_API_KEY: 'test-key' },
    now: new Date('2026-09-13T10:00:00Z'),
    tavilyFetchImpl: async (url, init) => {
      calls.push({ url: String(url), init });
      return tavilyResponse([{
        title: 'Ищу стилиста в Петербурге',
        url: 'https://example.test/post/1',
        content: 'СПб. Ищу стилиста по одежде, хочу разобрать гардероб.',
        score: 0.91,
        published_date: '2026-09-13T08:30:00Z',
      }]);
    },
  });

  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, 'https://api.tavily.com/search');
  assert.equal(calls[0].init.headers.authorization, 'Bearer test-key');
  const body = JSON.parse(calls[0].init.body);
  assert.equal(body.search_depth, 'basic');
  assert.equal(body.time_range, 'day');
  assert.equal(body.include_published_date, true);
  assert.equal(body.filter_by_published_date, true);
  assert.equal(body.max_results, 8);
  assert.equal(body.include_answer, false);
  assert.equal(result.sourcesChecked, 1);
  assert.equal(result.errors.length, 0);
  assert.equal(result.posts.length, 1);
  assert.equal(result.posts[0].link, 'https://example.test/post/1');
  assert.equal(new Date(result.posts[0].datetime).getTime(), new Date('2026-09-13T08:30:00Z').getTime());
  assert.equal(result.posts[0].source.kind, 'web');
  assert.match(result.posts[0].source.title, /Интернет/);
});

test('scanTavilyStylistLeads isolates a failed query and keeps healthy query results', async () => {
  assert.equal(typeof webApi.scanTavilyStylistLeads, 'function');
  const config = {
    webSearch: {
      enabled: true,
      queries: ['query one', 'query two'],
      maxResults: 5,
    },
  };
  let call = 0;
  const result = await webApi.scanTavilyStylistLeads(config, {
    env: { TAVILY_API_KEY: 'test-key' },
    now: new Date('2026-09-13T10:00:00Z'),
    tavilyFetchImpl: async () => {
      call += 1;
      if (call === 1) return new Response('no', { status: 500 });
      return tavilyResponse([{
        title: 'Нужен стилист',
        url: 'https://example.test/post/2',
        content: 'Петербург. Нужен стилист по одежде и помощь с образами.',
        score: 0.9,
        published_date: '2026-09-13T09:00:00Z',
      }]);
    },
  });

  assert.equal(result.sourcesChecked, 2);
  assert.equal(result.errors.length, 1);
  assert.equal(result.posts.length, 1);
});

test('scanAllStylistSources combines Telegram and web search without making one depend on the other', async () => {
  assert.equal(typeof webApi.scanAllStylistSources, 'function');
  const telegramPost = {
    source: { id: 'tg', title: 'Telegram', priority: 100 },
    id: '1',
    text: 'СПб. Ищу стилиста по одежде',
    datetime: '2026-09-13T08:00:00Z',
    link: 'https://t.me/test/1',
  };
  const webPost = {
    source: { id: 'web', title: 'Интернет', priority: 80, kind: 'web' },
    id: '2',
    text: 'Петербург. Нужен разбор гардероба',
    datetime: '2026-09-13T09:00:00Z',
    link: 'https://example.test/2',
  };
  const result = await webApi.scanAllStylistSources({ webSearch: { enabled: true } }, {
    telegramScanImpl: async () => ({ posts: [telegramPost], errors: [], sourcesChecked: 1 }),
    webScanImpl: async () => ({ posts: [webPost], errors: [{ source: { id: 'web-q2' }, error: 'failed' }], sourcesChecked: 2 }),
  });

  assert.deepEqual(result.posts.map((post) => post.link), [telegramPost.link, webPost.link]);
  assert.equal(result.sourcesChecked, 3);
  assert.equal(result.errors.length, 1);
});

test('scanAllStylistSources keeps Telegram working when Tavily key is missing', async () => {
  assert.equal(typeof webApi.scanAllStylistSources, 'function');
  const telegramPost = {
    source: { id: 'tg', title: 'Telegram', priority: 100 },
    id: '1',
    text: 'СПб. Ищу стилиста по одежде',
    datetime: '2026-09-13T08:00:00Z',
    link: 'https://t.me/test/1',
  };
  const result = await webApi.scanAllStylistSources({
    webSearch: { enabled: true, queries: ['query one'] },
    sources: [],
  }, {
    env: {},
    telegramScanImpl: async () => ({ posts: [telegramPost], errors: [], sourcesChecked: 1 }),
  });

  assert.equal(result.posts.length, 1);
  assert.equal(result.sourcesChecked, 2);
  assert.equal(result.errors.length, 1);
  assert.match(result.errors[0].error, /TAVILY_API_KEY/i);
});

test('web client-intent filter rejects generic stylist service advertising', () => {
  assert.equal(typeof webApi.isLikelyWebClientIntent, 'function');
  const text = 'Услуги стилиста в Санкт-Петербурге. Разбор гардероба, шопинг-сопровождение, подбор образов. Запись открыта.';
  assert.equal(webApi.isLikelyWebClientIntent(text), false);
});

test('web client-intent filter accepts pain-language that signals a real client need', () => {
  assert.equal(typeof webApi.isLikelyWebClientIntent, 'function');
  const text = 'Петербург. Не знаю что носить и как сочетать вещи, нужна помощь разобрать гардероб и собрать образы.';
  assert.equal(webApi.isLikelyWebClientIntent(text), true);
});

test('stylist lead config enables Tavily web search with a bounded daily query set and no embedded API key', () => {
  const config = require('../config/stylist-leads.json');
  assert.equal(config.webSearch?.enabled, true);
  assert.equal(config.webSearch?.provider, 'tavily');
  assert.equal(config.webSearch?.searchDepth, 'basic');
  assert.equal(config.webSearch?.timeRange, 'day');
  assert.equal(config.webSearch?.queries.length >= 4 && config.webSearch?.queries.length <= 8, true);
  assert.equal(JSON.stringify(config).includes('tvly-'), false);
});
