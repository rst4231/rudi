const test=require('node:test');
const assert=require('node:assert/strict');
const {
  monthRange,
  parseHolidayPage,
  sourceUrl,
  getHolidayCalendar,
}=require('../api/holiday-calendar.cjs');

test('holiday calendar resolves current and next Moscow month',()=>{
  const now=new Date('2026-09-21T09:00:00Z');
  assert.deepEqual(monthRange(now,'month'),{
    view:'month',year:2026,month:9,dayCount:30,monthKey:'2026-09'
  });
  assert.deepEqual(monthRange(now,'next-month'),{
    view:'next-month',year:2026,month:10,dayCount:31,monthKey:'2026-10'
  });
});

test('holiday parser keeps only the main holiday list before Orthodox section',()=>{
  const html=`
    <nav><li>Главная</li></nav>
    <h1>Какой праздник 1 октября?</h1>
    <h4>1 Октября 2026 - Четверг</h4>
    <ul>
      <li>Национальный день объятий</li>
      <li><img> Международный день пожилых людей в России</li>
      <li>День сухопутных войск</li>
      <li>Международный день музыки</li>
      <li>Всемирный день вегетарианства</li>
      <li>День кофе</li>
    </ul>
    <h3>Православные праздники 1 Октября 2026 г.:</h3>
    <ul><li>Преподобного Евмения Гортинского</li></ul>
  `;
  const rows=parseHolidayPage(html,5);
  assert.equal(rows.length,5);
  assert.ok(rows.includes('Международный день пожилых людей в России'));
  assert.ok(rows.includes('Международный день музыки'));
  assert.ok(!rows.includes('Преподобного Евмения Гортинского'));
  assert.ok(!rows.includes('Главная'));
});

test('holiday source URL follows the existing source path scheme',()=>{
  assert.equal(
    sourceUrl(1,10),
    'https://kakoysegodnyaprazdnik.com/prazdniki-1-oktyabrya.html'
  );
});

test('month result is cached and reused without refetching',async()=>{
  const state=new Map();
  const cache={
    async get(key){return state.get(key)??null},
    async set(key,value){state.set(key,value)}
  };
  let fetches=0;
  const fetchImpl=async(url)=>{
    fetches+=1;
    const day=Number(String(url).match(/prazdniki-(\d+)-/)?.[1]||1);
    return new Response(
      '<h1>Какой праздник?</h1><ul><li>Международный день теста '+day+'</li></ul><h3>Православные праздники</h3>',
      {status:200}
    );
  };
  const now=new Date('2026-09-21T09:00:00Z');
  const first=await getHolidayCalendar({now,view:'month',cache,fetchImpl,batchSize:8});
  assert.equal(first.days.length,30);
  assert.equal(fetches,30);
  const second=await getHolidayCalendar({now,view:'month',cache,fetchImpl,batchSize:8});
  assert.equal(second.cached,true);
  assert.equal(fetches,30);
});
