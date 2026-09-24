const { createStrictRuntimeCache } = require('./strict-runtime-cache.cjs');

const NAMESPACE = 'rudi-daily-mood-v1';
const TTL_SECONDS = 60 * 60 * 72;
const SNAPSHOT_TTL_SECONDS = 60 * 60 * 24 * 3650;
const STATE_KEY = 'state';
const MAX_SNAPSHOT_DAYS = 120;
const LEGACY_MOOD_ALIASES = Object.freeze({ low:'sadness', ok:'joy', great:'joy' });
const ALLOWED_MOODS = new Set(['sadness', 'fear', 'anger', 'joy', 'love']);

function normalizeMoodValue(value) {
  const mood=String(value || '').trim();
  return LEGACY_MOOD_ALIASES[mood] || mood;
}
const ACTORS = ['Рустам', 'Диана'];

function cacheOf(options = {}) {
  return options.moodCache || options.cache || createStrictRuntimeCache({ namespace: NAMESPACE });
}

function keyForDate(date) {
  return 'mood:' + String(date || '');
}

function normalizeMoodEntry(value) {
  const mood=normalizeMoodValue(value?.mood);
  return ALLOWED_MOODS.has(mood)
    ? { mood, updatedAt:String(value?.updatedAt || '') }
    : null;
}

function normalizeRow(row, date) {
  const moods = row && typeof row === 'object' && row.moods && typeof row.moods === 'object'
    ? row.moods
    : {};
  return {
    date: String(date || row?.date || ''),
    moods: {
      'Рустам': normalizeMoodEntry(moods?.['Рустам']),
      'Диана': normalizeMoodEntry(moods?.['Диана']),
    },
  };
}

function normalizeMoodState(value) {
  const source = value && typeof value === 'object' && !Array.isArray(value) ? value : {};
  const rawDays = source.days && typeof source.days === 'object' && !Array.isArray(source.days) ? source.days : {};
  const dates = Object.keys(rawDays)
    .filter((date)=>/^\d{4}-\d{2}-\d{2}$/.test(date))
    .sort()
    .slice(-MAX_SNAPSHOT_DAYS);
  const days = {};
  for (const date of dates) days[date] = normalizeRow(rawDays[date],date);
  return {
    initialized:Boolean(source.initialized || dates.length),
    version:Number(source.version || 0),
    days,
  };
}

function rowHasMood(row) {
  return ACTORS.some((actor)=>Boolean(row?.moods?.[actor]?.mood));
}

function newerMood(left,right) {
  if (!left) return right || null;
  if (!right) return left;
  const a=Date.parse(String(left.updatedAt||''))||0;
  const b=Date.parse(String(right.updatedAt||''))||0;
  return b>a?right:left;
}

function mergeMoodStates(base,overlay) {
  const a=normalizeMoodState(base);
  const b=normalizeMoodState(overlay);
  const days={...a.days};
  for(const [date,row] of Object.entries(b.days)){
    const current=normalizeRow(days[date],date);
    const incoming=normalizeRow(row,date);
    days[date]={
      date,
      moods:{
        'Рустам':newerMood(current.moods['Рустам'],incoming.moods['Рустам']),
        'Диана':newerMood(current.moods['Диана'],incoming.moods['Диана']),
      },
    };
  }
  const dates=Object.keys(days).sort().slice(-MAX_SNAPSHOT_DAYS);
  return {
    initialized:Boolean(a.initialized||b.initialized||dates.length),
    version:Math.max(Number(a.version||0),Number(b.version||0)),
    days:Object.fromEntries(dates.map(date=>[date,normalizeRow(days[date],date)])),
  };
}

async function readDailyMoodState(options = {}) {
  const cache=cacheOf(options);
  return normalizeMoodState(await cache.get(STATE_KEY));
}

async function writeDailyMoodState(value, options = {}) {
  const cache=cacheOf(options);
  const state=normalizeMoodState({
    ...value,
    initialized:true,
    version:Number(value?.version||Date.now()),
  });
  await cache.set(STATE_KEY,state,{
    ttl:SNAPSHOT_TTL_SECONDS,
    tags:['rudi-daily-mood','rudi-durable-state'],
    name:STATE_KEY,
  });
  return state;
}

async function readDailyMood(date, options = {}) {
  const cache = cacheOf(options);
  const direct = normalizeRow(await cache.get(keyForDate(date)), date);
  if (rowHasMood(direct)) return direct;

  const state = await readDailyMoodState({ ...options, moodCache:cache });
  const fallback = normalizeRow(state.days?.[String(date)] || null,date);
  if (rowHasMood(fallback)) {
    await cache.set(keyForDate(date),fallback,{
      ttl:TTL_SECONDS,
      tags:['rudi-daily-mood'],
    }).catch(()=>false);
    return fallback;
  }
  return direct;
}

async function setDailyMood(date, actor, mood, options = {}) {
  const normalizedMood = normalizeMoodValue(mood);
  if (!ACTORS.includes(actor)) throw new Error('mood-actor-invalid');
  if (!ALLOWED_MOODS.has(normalizedMood)) throw new Error('mood-value-invalid');

  const cache = cacheOf(options);
  const current = await readDailyMood(date, { ...options, moodCache: cache });
  current.moods[actor] = {
    mood: normalizedMood,
    updatedAt: new Date(options.now || Date.now()).toISOString(),
  };
  await cache.set(keyForDate(date), current, {
    ttl: TTL_SECONDS,
    tags: ['rudi-daily-mood'],
  });

  const state=await readDailyMoodState({ ...options, moodCache:cache });
  state.days[String(date)]=current;
  state.version=Date.now();
  await writeDailyMoodState(state,{ ...options, moodCache:cache });
  return current;
}

async function restoreDailyMoodState(snapshot, options = {}) {
  const incoming=normalizeMoodState(snapshot);
  if(!incoming.initialized) return readDailyMoodState(options);
  const cache=cacheOf(options);
  const current=await readDailyMoodState({ ...options, moodCache:cache });
  const merged=mergeMoodStates(current,incoming);
  merged.version=Math.max(Number(current.version||0),Number(incoming.version||0),Date.now());
  const stored=await writeDailyMoodState(merged,{ ...options, moodCache:cache });
  await Promise.all(Object.entries(stored.days).map(([date,row])=>
    cache.set(keyForDate(date),row,{ttl:TTL_SECONDS,tags:['rudi-daily-mood']}).catch(()=>false)
  ));
  return stored;
}

function moodView(row, actor) {
  const partner = actor === 'Рустам' ? 'Диана' : 'Рустам';
  return {
    date: row.date,
    actor,
    partner,
    mine: row.moods?.[actor] || null,
    partnerMood: row.moods?.[partner] || null,
  };
}

module.exports = {
  NAMESPACE,TTL_SECONDS,SNAPSHOT_TTL_SECONDS,STATE_KEY,MAX_SNAPSHOT_DAYS,
  readDailyMood,setDailyMood,moodView,
  normalizeRow,normalizeMoodState,mergeMoodStates,readDailyMoodState,writeDailyMoodState,restoreDailyMoodState,
};
