const test=require('node:test');
const assert=require('node:assert/strict');
const {normalizeRow}=require('../api/daily-mood-store.cjs');

test('daily mood supports the seven emotion model',()=>{
  const moods=['sadness','boredom','neutral','fatigue','anger','joy','love'];
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
  assert.equal(neutral.moods['Рустам'].mood,'neutral');

  const legacyFear=normalizeRow({moods:{'Рустам':{mood:'fear',updatedAt:'2026-09-24T09:03:00.000Z'}}},date);
  assert.equal(legacyFear.moods['Рустам'].mood,'boredom');
});


test('custom mood reason text is preserved only for the other reason',()=>{
  const date='2026-10-02';
  const custom=normalizeRow({
    moods:{
      'Рустам':{
        mood:'joy',
        updatedAt:'2026-10-02T09:00:00.000Z',
        samples:[{mood:'joy',updatedAt:'2026-10-02T09:00:00.000Z',reason:'other',reasonText:'  Хорошая встреча   с друзьями  '}],
      },
    },
  },date);
  assert.equal(custom.moods['Рустам'].samples[0].reason,'other');
  assert.equal(custom.moods['Рустам'].samples[0].reasonText,'Хорошая встреча с друзьями');

  const standard=normalizeRow({
    moods:{
      'Рустам':{
        mood:'joy',
        updatedAt:'2026-10-02T10:00:00.000Z',
        samples:[{mood:'joy',updatedAt:'2026-10-02T10:00:00.000Z',reason:'work',reasonText:'не должно сохраниться'}],
      },
    },
  },date);
  assert.equal(standard.moods['Рустам'].samples[0].reason,'work');
  assert.equal(standard.moods['Рустам'].samples[0].reasonText,'');
});
