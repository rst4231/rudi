const { isCronRequestAuthorized } = require('./cron-auth.cjs');
const { readHabits, viewHabits, moscowDateKey } = require('./habit-tracker-store.cjs');
const { sendPushNotification, readPendingPushNotifications } = require('./web-push.cjs');

const ACTORS = ['Рустам','Диана'];
const DAY_MS = 24 * 60 * 60 * 1000;

function reminderId(actor,date){
  return 'habit-reminder:' + actor + ':' + date;
}

async function sendHabitReminder(actor, options = {}) {
  const now = Number(options.now || Date.now());
  const date = moscowDateKey(now);
  const state = await readHabits(actor, { ...options, now });
  const view = viewHabits(state, { ...options, now, date });
  const pending = Math.max(0, Number(view?.pending || 0));
  if (!pending) return { actor, sent:false, reason:'all-marked', pending:0 };

  const id = reminderId(actor,date);
  const queued = await readPendingPushNotifications(actor, { ...options, now, maxAgeMs: DAY_MS }).catch(() => []);
  if ((Array.isArray(queued) ? queued : []).some((row) => String(row?.id || '') === id)) {
    return { actor, sent:false, reason:'already-sent', pending };
  }

  const noun = pending === 1 ? 'привычка' : pending < 5 ? 'привычки' : 'привычек';
  const result = await sendPushNotification(actor, {
    id,
    title:'Привычки на сегодня',
    body:'Осталось отметить ' + pending + ' ' + noun + '. Загляни и отметь, как прошёл день.',
    tag:'habit-reminder',
    url:'/?tab=habits&fresh=1',
  }, { ...options, now, urgency:'normal', ttlSeconds:60 * 60 * 3 });

  return { actor, pending, ...result };
}

async function handler(req,res){
  if (!isCronRequestAuthorized(req)) {
    console.warn('RUDI_HABIT_REMINDER_UNAUTHORIZED');
    return res.status(401).json({ ok:false, error:'unauthorized-cron' });
  }

  const results=[];
  for (const actor of ACTORS) {
    try {
      results.push(await sendHabitReminder(actor));
    } catch (error) {
      console.error('RUDI_HABIT_REMINDER_ERROR',actor,String(error?.message||error));
      results.push({ actor, sent:false, error:String(error?.message||error) });
    }
  }

  return res.status(200).json({ ok:true, results });
}

module.exports=handler;
module.exports.handler=handler;
module.exports.sendHabitReminder=sendHabitReminder;
module.exports.reminderId=reminderId;
