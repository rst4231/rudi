const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {runCinemaPremieresCron}=require('../api/cinema-premieres-cron.js');

test('cinema cron is scheduled for Thursday 00:02 Moscow',()=>{
  const config=JSON.parse(fs.readFileSync(path.join(__dirname,'..','vercel.json'),'utf8'));
  const row=config.crons.find(item=>item.path==='/api/cinema-premieres-cron');
  assert.equal(row.schedule,'2 21 * * 3');
});

test('cinema cron writes fresh cinema into Feed after collection',async()=>{
  const calls=[];
  const result=await runCinemaPremieresCron({
    now:new Date('2026-09-30T21:02:00.000Z'),
    loadSettingsImpl:async()=>({settings:{sections:{cinema:{enabled:true}}}}),
    runNativeImpl:async(section,options)=>{
      calls.push(['collect',section,options.date,options.force]);
      return {
        date:options.date,
        published:1,
        feedMessage:'🎬 <b>Кинопремьеры</b>\n\nСегодняшний фильм',
        feedItems:[{title:'Сегодняшний фильм',releaseDate:options.date}],
      };
    },
    updateFeedImpl:async(sections,options)=>{
      calls.push(['feed',sections.cinema.items[0].title,options.date]);
      return {sections};
    },
  });

  assert.equal(result.date,'2026-10-01');
  assert.deepEqual(calls,[
    ['collect','cinema','2026-10-01',true],
    ['feed','Сегодняшний фильм','2026-10-01'],
  ]);
});
