const test=require('node:test');
const assert=require('node:assert/strict');
const {BIRTH_DATE,BIRTH_YEAR,luluToiletProbability}=require('../api/lulu-toilet.cjs');

test('Lulu toilet probability starts at zero immediately after a walk',()=>{
  const walkedAt='2026-09-25T14:07:00.000Z';
  assert.equal(luluToiletProbability(walkedAt,new Date(walkedAt)),0);
});

test('Lulu toilet probability follows the slower time-based curve',()=>{
  const walkedAt='2026-09-25T14:07:00.000Z';
  const at=(hours)=>new Date(Date.parse(walkedAt)+hours*3600000);
  assert.equal(luluToiletProbability(walkedAt,at(2)),18);
  assert.equal(luluToiletProbability(walkedAt,at(3)),28);
  assert.equal(luluToiletProbability(walkedAt,at(4)),43);
  assert.equal(luluToiletProbability(walkedAt,at(5)),65);
  assert.equal(luluToiletProbability(walkedAt,at(6)),85);
  assert.equal(luluToiletProbability(walkedAt,at(7)),96);
  assert.equal(luluToiletProbability(walkedAt,at(8)),100);
});

test('Lulu toilet probability is smooth between curve points',()=>{
  const walkedAt='2026-09-25T14:07:00.000Z';
  const now=new Date('2026-09-25T16:48:00.000Z');
  assert.equal(luluToiletProbability(walkedAt,now),25);
});

test('meal and water do not add hidden percentage boosts',()=>{
  const morningWalk='2026-09-25T05:00:00.000Z';
  const eveningWalk='2026-09-25T17:00:00.000Z';
  assert.equal(luluToiletProbability(morningWalk,new Date('2026-09-25T07:00:00.000Z')),18);
  assert.equal(luluToiletProbability(eveningWalk,new Date('2026-09-25T19:00:00.000Z')),18);
});


test('Lulu birth date is stored precisely',()=>{
  assert.equal(BIRTH_DATE,'2021-05-05');
  assert.equal(BIRTH_YEAR,2021);
});
