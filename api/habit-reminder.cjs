const { isCronRequestAuthorized } = require('./cron-auth.cjs');
const { readHabits, viewHabits, moscowDateKey } = require('./habit-tracker-store.cjs');
const { loadTodayTasks, filterTasksForActor } = require('./morning-summary.cjs');
const { loadDueObligationsByActor, eveningObligationPart } = require('./finance-obligation-reminders.cjs');
const { readRecipients } = require('./partner-notification-store.cjs');
const { telegramSendMessage } = require('./telegram-notifications.cjs');
const { createStrictRuntimeCache } = require('./strict-runtime-cache.cjs');

const ACTORS = ['Рустам','Диана'];
const NAMESPACE = 'rudi-evening-summary-v1';
const TTL_SECONDS = 60 * 60 * 24 * 3650;

function cacheOf(options = {}) {
  return options.eveningSummaryCache || createStrictRuntimeCache({
    namespace: NAMESPACE,
    confirmWrites: false,
    ...(options.eveningSummaryCacheOptions || {}),
  });
}

function reminderId(actor,date){
  return 'habit-reminder:' + actor + ':' + date;
}

function markerKey(actor){
  return 'last:' + String(actor || '');
}

async function readEveningMarker(actor, options = {}) {
  const value = await cacheOf(options).get(markerKey(actor)).catch(() => null);
  if (!value || typeof value !== 'object') return null;
  return {
    date: String(value.date || ''),
    sentAt: String(value.sentAt || ''),
  };
}

async function writeEveningMarker(actor, date, sentAt, options = {}) {
  await cacheOf(options).set(markerKey(actor), {
    date: String(date || ''),
    sentAt: String(sentAt || ''),
  }, {
    ttl: TTL_SECONDS,
    tags: ['rudi-evening-summary'],
    name: 'evening-summary-' + actor,
  });
  return true;
}

function pendingTaskDetails(tasks,actor){
  const visible=filterTasksForActor(tasks,actor);
  const personal=[];
  const shared=[];
  for(const task of visible){
    const title=String(task?.title||'').replace(/\s+/g,' ').trim();
    if(!title)continue;
    if(task?.assigned && String(task?.assignee||'')!=='Не назначен') personal.push(title);
    else shared.push(title);
  }
  return {personal,shared,total:personal.length+shared.length};
}

function pendingTaskCounts(tasks,actor){
  const details=pendingTaskDetails(tasks,actor);
  return {personal:details.personal.length,shared:details.shared.length,total:details.total};
}

function pendingHabitNames(view){
  return (Array.isArray(view?.habits)?view.habits:[])
    .filter(row=>String(view?.statuses?.[row?.id]||'')==='pending')
    .map(row=>[String(row?.emoji||'').trim(),String(row?.name||'').trim()].filter(Boolean).join(' '))
    .filter(Boolean);
}

function buildEveningSummary(actor, data = {}) {
  const pendingHabits=Array.isArray(data.pendingHabits)?data.pendingHabits.filter(Boolean):[];
  const taskDetails=data.taskDetails||{personal:[],shared:[]};
  const personalTasks=Array.isArray(taskDetails.personal)?taskDetails.personal.filter(Boolean):[];
  const sharedTasks=Array.isArray(taskDetails.shared)?taskDetails.shared.filter(Boolean):[];
  const obligationRows=Array.isArray(data.obligationRows)?data.obligationRows:[];
  const blocks=[];

  if(pendingHabits.length){
    blocks.push('Привычки:\n'+pendingHabits.map(name=>'• '+name).join('\n'));
  }
  if(personalTasks.length){
    blocks.push('Личные дела:\n'+personalTasks.map(title=>'• '+title).join('\n'));
  }
  if(sharedTasks.length){
    blocks.push('Совместные дела:\n'+sharedTasks.map(title=>'• '+title).join('\n'));
  }

  const obligationPart=eveningObligationPart(obligationRows);
  if(obligationPart)blocks.push(obligationPart);

  return String(actor||'').trim()+', добрый вечер!\n\n'
    +'Что осталось на сегодня:\n\n'
    +blocks.join('\n\n')
    +'\n\nЗагляни и закрой оставшееся.';
}

async function sendHabitReminder(actor, options = {}) {
  const now = Number(options.now || Date.now());
  const date = moscowDateKey(now);
  const [state,tasks,obligationsByActor] = await Promise.all([
    readHabits(actor, { ...options, now }),
    loadTodayTasks({ ...options, now, includePersonal: actor === 'Рустам' }).catch(() => null),
    loadDueObligationsByActor({ ...options, now }).catch(() => ({ [actor]:[] })),
  ]);
  const view = viewHabits(state, { ...options, now, date });
  const pendingHabits=pendingHabitNames(view);
  const pending=pendingHabits.length;
  const taskDetails=pendingTaskDetails(tasks,actor);
  const taskCounts={personal:taskDetails.personal.length,shared:taskDetails.shared.length,total:taskDetails.total};
  const obligationRows=Array.isArray(obligationsByActor?.[actor])?obligationsByActor[actor]:[];
  const unpaidObligations=obligationRows.filter(row=>!row.paid);
  if (!pending && !taskDetails.total && !unpaidObligations.length) {
    return { actor, sent:false, reason:'all-done', pending:0, personalTasks:0, sharedTasks:0, unpaidObligations:0 };
  }

  const marker = await readEveningMarker(actor, options);
  if (marker?.date === date) {
    return {
      actor,
      sent:false,
      reason:'already-sent',
      pending,
      personalTasks:taskCounts.personal,
      sharedTasks:taskCounts.shared,
      unpaidObligations:unpaidObligations.length,
    };
  }

  const recipients = options.recipients || await readRecipients(options);
  const chatId = Number(recipients?.[actor]);
  if (!Number.isInteger(chatId) || chatId <= 0) {
    return {
      actor,
      sent:false,
      reason:'missing-recipient',
      pending,
      personalTasks:taskCounts.personal,
      sharedTasks:taskCounts.shared,
      unpaidObligations:unpaidObligations.length,
    };
  }

  const text=buildEveningSummary(actor,{pendingHabits,taskDetails,obligationRows});
  const result = await telegramSendMessage(chatId, text, {
    ...options,
    fetchImpl: options.telegramFetchImpl || options.fetchImpl || globalThis.fetch,
    parseMode: false,
  });
  await writeEveningMarker(actor, date, new Date(now).toISOString(), options);

  return {
    actor,
    sent:true,
    pending,
    personalTasks:taskCounts.personal,
    sharedTasks:taskCounts.shared,
    unpaidObligations:unpaidObligations.length,
    ...result,
  };
}

async function handleHabitReminderCron(req,res){
  if (!isCronRequestAuthorized(req)) {
    console.warn('RUDI_HABIT_REMINDER_UNAUTHORIZED');
    return res.status(401).json({ ok:false, error:'unauthorized-cron' });
  }

  const recipients = await readRecipients().catch((error) => {
    console.error('RUDI_EVENING_RECIPIENTS_ERROR', String(error?.message || error));
    return {};
  });

  const results=[];
  for (const actor of ACTORS) {
    try {
      results.push(await sendHabitReminder(actor, { recipients }));
    } catch (error) {
      console.error('RUDI_HABIT_REMINDER_ERROR',actor,String(error?.message||error));
      results.push({ actor, sent:false, error:String(error?.message||error) });
    }
  }

  return res.status(200).json({ ok:true, results });
}

module.exports={
  ACTORS,
  NAMESPACE,
  handleHabitReminderCron,
  sendHabitReminder,
  reminderId,
  pendingTaskDetails,
  pendingTaskCounts,
  pendingHabitNames,
  buildEveningSummary,
  readEveningMarker,
  writeEveningMarker,
};
