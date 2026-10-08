const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const {buildRecommendations,visibleRecommendations,rulesFrom,moscowDate}=require('../api/recommendations.cjs');

const NOW=new Date('2026-10-08T12:00:00.000Z');
const finance={
  categories:[{id:'food',name:'Еда'}],
  personalExpenses:[
    {categoryId:'food',month:'2026-09',rubAmount:3000},
    ...[2000,2000,2000].map(amount=>({categoryId:'food',month:'2026-10',rubAmount:amount}))
  ],
  wallets:[{id:'rub',currency:'RUB',type:'regular',balance:1000}],
  plan:{obligations:[{id:'internet',title:'Интернет',amount:2500,day:11,active:true,paidMonths:[]}]}
};
test('recommendations only appear from real source data',()=>{
  assert.deepEqual(buildRecommendations({now:NOW}),[]);
  assert.deepEqual(buildRecommendations({now:NOW,humidity:{value:null,updatedAt:NOW.toISOString()}}),[]);
});
test('food spending compares full previous month against actual current-month spending',()=>{
  const rows=buildRecommendations({now:NOW,finance});
  assert.match(rows.find(x=>x.id==='spending:2026-10:food').detail,/весь прошлый/);
  const fewer={...finance,personalExpenses:finance.personalExpenses.slice(0,3)};
  assert.equal(buildRecommendations({now:NOW,finance:fewer}).some(x=>x.id.startsWith('spending:')),false);
});
test('unpaid upcoming obligation warns, paid one stays silent',()=>{
  const rows=buildRecommendations({now:NOW,finance});
  assert.equal(rows.find(x=>x.id==='payment:2026-10:internet').severity,'urgent');
  const paid={...finance,plan:{obligations:[{...finance.plan.obligations[0],paidMonths:['2026-10']}]}};
  assert.equal(buildRecommendations({now:NOW,finance:paid}).some(x=>x.id.startsWith('payment:')),false);
});
test('task overload has no fabricated completion rate',()=>{
  const rows=buildRecommendations({now:NOW,taskCount:8});
  assert.equal(rows.length,1);
  assert.match(rows[0].detail,/8 невыполненных/);
  assert.equal(buildRecommendations({now:NOW,taskCount:7}).length,0);
});
test('home humidity must have a recent valid measurement',()=>{
  assert.equal(buildRecommendations({now:NOW,humidity:{value:35,updatedAt:NOW.toISOString()}}).length,1);
  assert.equal(buildRecommendations({now:NOW,humidity:{value:35,updatedAt:'2026-10-06T12:00:00Z'}}).length,0);
});
test('car service respects recent mileage and serviced state',()=>{
  assert.equal(buildRecommendations({now:NOW,car:{mileage:44900,mileageUpdatedAt:NOW.toISOString()}})[0].id,'service:45000');
  assert.equal(buildRecommendations({now:NOW,car:{mileage:44900,mileageUpdatedAt:NOW.toISOString(),lastServiceAt:'2026-10-01'}}).length,0);
  assert.equal(buildRecommendations({now:NOW,car:{mileage:44900,mileageUpdatedAt:'2025-01-01T12:00:00Z'}}).length,0);
});
test('hide and snooze survive refresh and expire as expected',()=>{
  const rows=[{id:'tasks:2026-10-08'}];
  assert.equal(visibleRecommendations(rows,{entries:{'tasks:2026-10-08':{action:'hide'}}}).length,0);
  assert.equal(visibleRecommendations(rows,{entries:{'tasks:2026-10-08':{action:'snooze',until:NOW.getTime()+1000}}},NOW.getTime()).length,0);
  assert.equal(visibleRecommendations(rows,{entries:{'tasks:2026-10-08':{action:'snooze',until:NOW.getTime()-1000}}},NOW.getTime()).length,1);
});
test('rule limits are guarded and Moscow dates are used',()=>{
  assert.equal(rulesFrom({lowHumidity:500}).lowHumidity,40);
  assert.equal(rulesFrom({lowHumidity:38}).lowHumidity,38);
  assert.equal(moscowDate(new Date('2026-10-08T22:30:00Z')),'2026-10-09');
});
test('recommendations are wired to home tile, script and authenticated API',()=>{
  const html=fs.readFileSync('public/index.html','utf8');
  const app=fs.readFileSync('public/app.js','utf8');
  const api=fs.readFileSync('api/index.js','utf8');
  assert.match(html,/id="rudiRecommendationsTile"/);
  assert.match(html,/\/recommendations\.js\?v=/);
  assert.match(app,/recommendations','smart-home/);
  assert.match(api,/handleRecommendations\(req, res\)/);
});
