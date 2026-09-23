const test = require('node:test');
const assert = require('node:assert/strict');
const {
  normalizeCatalog,
  chooseUnseenFact,
  readDailyMalePsychologyFact,
} = require('../api/male-psychology-fact.cjs');

function memoryCache() {
  const data = new Map();
  return {
    async get(key) { return data.has(key) ? data.get(key) : null; },
    async set(key, value) { data.set(key, structuredClone(value)); return true; },
    data,
  };
}

const catalog = {
  enabled: true,
  disclaimer: 'Средние групповые закономерности.',
  facts: [
    { id:'a', title:'A', text:'Fact A', sourceLabel:'A', sourceUrl:'https://pubmed.ncbi.nlm.nih.gov/25581005/' },
    { id:'b', title:'B', text:'Fact B', sourceLabel:'B', sourceUrl:'https://pubmed.ncbi.nlm.nih.gov/23989235/' },
    { id:'c', title:'C', text:'Fact C', sourceLabel:'C', sourceUrl:'https://pubmed.ncbi.nlm.nih.gov/40038563/' },
  ],
};

test('male psychology catalog rejects duplicates and non-PubMed sources', () => {
  const normalized = normalizeCatalog({ malePsychology: {
    enabled:true,
    facts:[
      ...catalog.facts,
      { ...catalog.facts[0], title:'duplicate' },
      { id:'bad', title:'Bad', text:'Bad', sourceUrl:'https://example.com/' },
    ],
  }});
  assert.equal(normalized.facts.length,3);
  assert.deepEqual(normalized.facts.map(row=>row.id),['a','b','c']);
});

test('daily male psychology fact stays stable for the day and never reuses an id', async () => {
  const cache = memoryCache();
  const first = await readDailyMalePsychologyFact({ cache, catalog, now:'2026-09-23T12:00:00Z' });
  const sameDay = await readDailyMalePsychologyFact({ cache, catalog, now:'2026-09-23T20:00:00Z' });
  const second = await readDailyMalePsychologyFact({ cache, catalog, now:'2026-09-24T12:00:00Z' });
  const third = await readDailyMalePsychologyFact({ cache, catalog, now:'2026-09-25T12:00:00Z' });
  assert.equal(first.id,sameDay.id);
  assert.equal(new Set([first.id,second.id,third.id]).size,3);
  const exhausted = await readDailyMalePsychologyFact({ cache, catalog, now:'2026-09-26T12:00:00Z' });
  assert.equal(exhausted,null);
  assert.equal(cache.data.get('used-ids').length,3);
});

test('unseen selector is deterministic for the same date', () => {
  const normalized = normalizeCatalog({ malePsychology: catalog });
  const one = chooseUnseenFact(normalized.facts,new Set(['a']),'2026-09-23');
  const two = chooseUnseenFact(normalized.facts,new Set(['a']),'2026-09-23');
  assert.equal(one.id,two.id);
  assert.notEqual(one.id,'a');
});

test('daily male psychology fact refuses degraded rotation when persistent history fails', async () => {
  const brokenCache = {
    async get() { throw new Error('cache-down'); },
    async set() { throw new Error('cache-down'); },
  };
  const value = await readDailyMalePsychologyFact({
    cache: brokenCache,
    catalog,
    now:'2026-09-23T12:00:00Z',
  });
  assert.equal(value,null);
});

