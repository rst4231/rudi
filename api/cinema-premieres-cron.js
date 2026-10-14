const { isCronRequestAuthorized } = require('./cron-auth.cjs');
const { loadRudiSettings } = require('./rudi-settings.cjs');
const { runNativeSection } = require('./section-runners.cjs');
const { updateFeedSections, moscowDateKey } = require('./feed-store.cjs');

async function runCinemaPremieresCron(options = {}) {
  const now = options.now instanceof Date ? options.now : new Date(options.now || Date.now());
  const date = moscowDateKey(now);
  const loaded = await (options.loadSettingsImpl || loadRudiSettings)({ ...options, now: now.getTime() });
  const settings = loaded?.settings || loaded || {};
  if (settings.sections?.cinema?.enabled === false) return { date, skipped: 'disabled' };

  const cinema = await (options.runNativeImpl || runNativeSection)('cinema', {
    ...options,
    date,
    now,
    settings,
    force: true,
  });

  if (cinema?.failed) return { date, cinema };
  const feedMessage = String(cinema?.feedMessage || '').trim();
  const feedItems = Array.isArray(cinema?.feedItems) ? cinema.feedItems : [];
  if (feedMessage || feedItems.length) {
    await (options.updateFeedImpl || updateFeedSections)({
      cinema: {
        parts: feedMessage ? [feedMessage] : [],
        items: feedItems,
        source: 'cinema-cron-0002',
      },
    }, { ...options, date, now });
  }
  return { date, cinema };
}

async function handler(req,res){
  if(!isCronRequestAuthorized(req)) return res.status(401).json({ok:false,error:'unauthorized-cron'});
  const now=new Date();
  let result=null,cinemaError=null;
  try{
    result=await runCinemaPremieresCron({now});
    console.log('RUDI_CINEMA_CRON_RESULT',JSON.stringify(result));
  }catch(error){
    cinemaError=error;
    console.error('RUDI_CINEMA_CRON_ERROR',String(error?.message||error));
  }
  let entertainmentCalendar=null;
  try{
    entertainmentCalendar=await require('./calendar-entertainment.cjs').refresh({now});
    console.log('RUDI_ENTERTAINMENT_CRON_RESULT',JSON.stringify(entertainmentCalendar));
  }catch(error){
    console.error('RUDI_ENTERTAINMENT_CRON_ERROR',String(error?.message||error));
    entertainmentCalendar={failed:true};
  }
  if(cinemaError)return res.status(500).json({ok:false,error:'cinema-cron-failed',entertainmentCalendar});
  return res.status(200).json({ok:true,...result,entertainmentCalendar});
}

module.exports=handler;
module.exports.runCinemaPremieresCron=runCinemaPremieresCron;
