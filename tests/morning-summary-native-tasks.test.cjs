'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const native = require('../api/shared-native-tasks.cjs');
const {loadTodayTasks, filterTasksForActor, buildMorningSummary} = require('../api/morning-summary.cjs');
const {pendingTaskDetails} = require('../api/habit-reminder.cjs');
const now = new Date('2026-10-23T22:30:00Z'); // Already October 24 in Moscow.
const date = '2026-10-24';

async function fixture(overrides = {}) {
  const rows = new Map(), key = (ns, id) => ns + '\0' + id;
  const client = {
    async getRecord(ns, id) { const value = rows.get(key(ns, id)); return value ? {key:id, value:structuredClone(value)} : null; },
    async set(ns, id, value) { rows.set(key(ns, id), structuredClone(value)); return true; },
    async list(ns) { return [...rows].filter(([id]) => id.startsWith(ns + '\0')).map(([id, value]) => ({key:id.slice(ns.length + 1), value:structuredClone(value)})); },
  };
  await client.set(native.STATE_NS, 'ready', {complete:true});
  for (const [id, title, responsible, day, extra] of [
    ['together', 'Погулять вместе', '', date, {}],
    ['rustam', 'Забрать посылку', 'Рустам', date, {}],
    ['diana', 'Запись Дианы', 'Диана', date, {}],
    ['tomorrow', 'Завтрашнее дело', '', '2026-10-25', {}],
    ['deleted', 'Удалённое дело', '', date, {deleted:true}],
    ['finished', 'Выполненное дело', '', date, {}],
    ['repeat', 'Повторяющееся дело', '', '2026-10-23', {repeat:'daily',repeatCount:3}],
    ['repeat-done', 'Выполненный повтор', '', '2026-10-23', {repeat:'daily',repeatCount:3}],
  ]) {
    await client.set(native.TASK_NS, id, {...native.normalizeTask({title,responsible,date:day,time:'10:00',...extra},{id}),...extra});
  }
  await client.set(native.DONE_NS + '2026-10', 'finished', {actor:'Рустам'});
  await client.set(native.DONE_NS + '2026-10', 'repeat-done__2026-10-24', {actor:'Диана'});
  return {
    client, now,
    readTokenImpl:async()=>({accessToken:'shared'}),
    readPersonalTokenImpl:async()=>({accessToken:'private'}),
    loadTickTickConfigImpl:async()=>({enabled:true,projectId:'legacy-shared'}),
    fetchProjectDataImpl:async()=>({tasks:[{id:'together',title:'Старое название из TickTick',status:0,startDate:date+'T10:00:00+0300'}]}),
    readSharedTaskMetaStateImpl:async()=>({entries:{}}),
    fetchPersonalProjectTasksImpl:async()=>[{id:'private',title:'Личная задача TickTick',projectId:'private-list',status:0,startDate:date+'T09:00:00+0300'}],
    ...overrides,
  };
}

test('summary uses native shared agenda, current assignments and open occurrences instead of stale TickTick copies', async () => {
  const tasks = await loadTodayTasks(await fixture());
  assert.deepEqual(filterTasksForActor(tasks,'Рустам').map(task=>task.title),
    ['Личная задача TickTick','Забрать посылку','Повторяющееся дело','Погулять вместе']);
  assert.deepEqual(filterTasksForActor(tasks,'Диана').map(task=>task.title),
    ['Запись Дианы','Повторяющееся дело','Погулять вместе']);
  const text = buildMorningSummary('Рустам',{tasks,date});
  assert.match(text,/Погулять вместе/);
  assert.doesNotMatch(text,/Старое название|Запись Дианы|Выполненн|Удалённое|Завтрашнее/);
  assert.deepEqual(pendingTaskDetails(tasks,'Рустам'),{
    personal:['Личная задача TickTick','Забрать посылку'],
    shared:['Повторяющееся дело','Погулять вместе'],total:4,
  });
});

test('native shared tasks remain available without any TickTick connection', async () => {
  const tasks = await loadTodayTasks(await fixture({readTokenImpl:async()=>null,readPersonalTokenImpl:async()=>null}));
  assert.deepEqual(new Set(filterTasksForActor(tasks,'Рустам').map(task=>task.title)),
    new Set(['Забрать посылку','Повторяющееся дело','Погулять вместе']));
});

test('broken personal TickTick does not hide native shared tasks', async () => {
  const tasks = await loadTodayTasks(await fixture({fetchPersonalProjectTasksImpl:async()=>{throw Error('ticktick-unavailable');}}));
  assert.ok(filterTasksForActor(tasks,'Рустам').some(task=>task.title==='Погулять вместе'));
  assert.ok(!tasks.some(task=>task.title==='Старое название из TickTick'));
});

test('an empty migrated agenda does not resurrect removed legacy TickTick tasks', async () => {
  const options = await fixture({includePersonal:false});
  options.client.list = async()=>[];
  const tasks = await loadTodayTasks(options);
  assert.deepEqual(tasks,[]);
});

test('native tasks survive disabled TickTick configuration and a failed native read never restores stale copies', async () => {
  const options = await fixture({loadTickTickConfigImpl:async()=>({enabled:false})});
  const tasks = await loadTodayTasks(options);
  assert.equal(filterTasksForActor(tasks,'Рустам').length,3);
  options.client.list = async()=>{throw Error('native-unavailable');};
  options.loadTickTickConfigImpl = async()=>({enabled:true,projectId:'legacy-shared'});
  const partial = await loadTodayTasks(options);
  assert.deepEqual(partial.map(task=>task.title),['Личная задача TickTick']);
});
