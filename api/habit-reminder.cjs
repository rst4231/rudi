const { isCronRequestAuthorized } = require('./cron-auth.cjs');
const { readHabits, viewHabits, moscowDateKey } = require('./habit-tracker-store.cjs');
const { sendPushNotification, readPendingPushNotifications } = require('./web-push.cjs');
const { loadTodayTasks, filterTasksForActor } = require('./morning-summary.cjs');

const ACTORS = ['Рустам','Диана'];
const DAY_MS = 24 * 60 * 60 * 1000;

function reminderId(actor,date){
  return 'habit-reminder:' + actor + ':' + date;
}

function pendingTaskCounts(tasks,actor){
  const visible=filterTasksForActor(tasks,actor);
  let personal=0;
  let shared=0;
  for(const task of visible){
    if(task?.assigned && String(task?.assignee||'')!=='Не назначен') personal+=1;
    else shared+=1;
  }
  return {personal,shared,total:personal+shared};
}

async function sendHabitReminder(actor, options = {}) {
  const now = Number(options.now || Date.now());
  const date = moscowDateKey(now);
  const [state,tasks] = await Promise.all([
    readHabits(actor, { ...options, now }),
    loadTodayTasks({ ...options, now }).catch(() => null),
  ]);
  const view = viewHabits(state, { ...options, now, date });
  const pending = Math.max(0, Number(view?.pending || 0));
  const taskCounts=pendingTaskCounts(tasks,actor);
  if (!pending && !taskCounts.total) {
    return { actor, sent:false, reason:'all-done', pending:0, personalTasks:0, sharedTasks:0 };
  }

  const id = reminderId(actor,date);
  const queued = await readPendingPushNotifications(actor, { ...options, now, maxAgeMs: DAY_MS }).catch(() => []);
  if ((Array.isArray(queued) ? queued : []).some((row) => String(row?.id || '') === id)) {
    return { actor, sent:false, reason:'already-sent', pending, personalTasks:taskCounts.personal, sharedTasks:taskCounts.shared };
  }

  const parts=[];
  if(pending) parts.push('Привычки: '+pending);
  if(taskCounts.personal) parts.push('Личные дела: '+taskCounts.personal);
  if(taskCounts.shared) parts.push('Совместные дела: '+taskCounts.shared);
  const result = await sendPushNotification(actor, {
    id,
    title:'Что осталось на сегодня',
    body:parts.join(' · ')+'. Загляни и закрой оставшееся.',
    tag:'evening-reminder',
    url:taskCounts.total?'/?tab=home&item=priority':'/?tab=habits&fresh=1',
  }, { ...options, now, urgency:'normal', ttlSeconds:60 * 60 * 3 });

  return {
    actor,
    pending,
    personalTasks:taskCounts.personal,
    sharedTasks:taskCounts.shared,
    ...result,
  };
}

async function handleHabitReminderCron(req,res){
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

module.exports={
  handleHabitReminderCron,
  sendHabitReminder,
  reminderId,
  pendingTaskCounts,
};
