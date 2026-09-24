const test=require('node:test');
const assert=require('node:assert/strict');
const {normalizeRow}=require('../api/daily-mood-store.cjs');

test('daily mood supports the five emotion model',()=>{
  const moods=['sadness','fear','anger','joy','love'];
  for(const mood of moods){
    const row=normalizeRow({moods:{'Рустам':{mood,updatedAt:'2026-09-24T09:00:00.000Z'}}},'2026-09-24');
    assert.equal(row.moods['Рустам'].mood,mood);
  }
});

test('legacy mood values migrate without losing saved state',()=>{
  const date='2026-09-24';
  const row=normalizeRow({
    moods:{
      'Рустам':{mood:'low',updatedAt:'2026-09-24T09:00:00.000Z'},
      'Диана':{mood:'great',updatedAt:'2026-09-24T09:01:00.000Z'},
    },
  },date);
  assert.equal(row.moods['Рустам'].mood,'sadness');
  assert.equal(row.moods['Диана'].mood,'joy');

  const neutral=normalizeRow({moods:{'Рустам':{mood:'ok',updatedAt:'2026-09-24T09:02:00.000Z'}}},date);
  assert.equal(neutral.moods['Рустам'].mood,'joy');
});
