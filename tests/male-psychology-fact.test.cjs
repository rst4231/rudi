const test = require('node:test');
const assert = require('node:assert/strict');
const {
  normalizeCatalog,
  factForDate,
  readDailyMalePsychologyFact,
} = require('../api/male-psychology-fact.cjs');

const catalog = {
  enabled:true,
  startDate:'2026-09-23',
  disclaimer:'Средние групповые закономерности.',
  facts:[
    { id:'a', sequence:1, title:'A', text:'Fact A', sourceLabel:'A', sourceUrl:'https://pubmed.ncbi.nlm.nih.gov/25581005/' },
    { id:'b', sequence:2, title:'B', text:'Fact B', sourceLabel:'B', sourceUrl:'https://pubmed.ncbi.nlm.nih.gov/23989235/' },
    { id:'c', sequence:3, title:'C', text:'Fact C', sourceLabel:'C', sourceUrl:'https://pubmed.ncbi.nlm.nih.gov/40038563/' },
  ],
};

test('catalog keeps unique ids and sequences and PubMed-only sources',()=>{
  const normalized=normalizeCatalog({malePsychology:{
    ...catalog,
    facts:[
      ...catalog.facts,
      {...catalog.facts[0],id:'dup-sequence'},
      {...catalog.facts[0],sequence:4},
      {id:'bad',sequence:5,title:'Bad',text:'Bad',sourceUrl:'https://example.com/'}
    ]
  }});
  assert.deepEqual(normalized.facts.map(row=>row.id),['a','b','c']);
});

test('one sequence maps to one Moscow day without repeats',()=>{
  const normalized=normalizeCatalog({malePsychology:catalog});
  assert.equal(factForDate(normalized,'2026-09-23').id,'a');
  assert.equal(factForDate(normalized,'2026-09-24').id,'b');
  assert.equal(factForDate(normalized,'2026-09-25').id,'c');
  assert.equal(factForDate(normalized,'2026-09-26'),null);
});

test('daily fact is stable for the same date and advances next day',async()=>{
  const first=await readDailyMalePsychologyFact({catalog,now:'2026-09-23T12:00:00Z'});
  const same=await readDailyMalePsychologyFact({catalog,now:'2026-09-23T20:00:00Z'});
  const next=await readDailyMalePsychologyFact({catalog,now:'2026-09-24T12:00:00Z'});
  assert.equal(first.id,'a');
  assert.equal(same.id,'a');
  assert.equal(next.id,'b');
});
