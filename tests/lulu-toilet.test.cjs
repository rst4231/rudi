const test=require('node:test');
const assert=require('node:assert/strict');
const {luluToiletProbability,mealWindowBoost}=require('../api/lulu-toilet.cjs');

test('Lulu toilet probability starts at zero immediately after a walk',()=>{
  const walkedAt='2026-09-25T15:00:00.000Z';
  assert.equal(luluToiletProbability(walkedAt,new Date(walkedAt)),0);
});

test('Lulu toilet probability reaches 100 after a long adult-dog interval',()=>{
  assert.equal(
    luluToiletProbability('2026-09-25T03:00:00.000Z',new Date('2026-09-25T13:30:00.000Z')),
    100
  );
});

test('meal windows add urgency when the last walk was before or during feeding',()=>{
  const now=new Date('2026-09-25T06:30:00.000Z');
  assert.equal(mealWindowBoost('2026-09-25T04:00:00.000Z',now),10);
  assert.equal(mealWindowBoost('2026-09-25T06:15:00.000Z',now),0);
});
