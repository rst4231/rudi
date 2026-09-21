const test = require('node:test');
const assert = require('node:assert/strict');
const {
  buildTickTickCalendar,
  tickTickTaskDateKeys,
} = require('../api/ticktick-client.cjs');

test('real Monday shared task appears on 21 September', () => {
  const task = {
    id:'6a9aff5fdc5ed12946ec7d16',
    title:'🧼 Генеральная уборка',
    startDate:'2026-09-21T00:00:00+0300',
    dueDate:'2026-09-21T00:00:00+0300',
    timeZone:'Europe/Moscow',
    isAllDay:true,
    status:0,
    assigneeUsername:'dianochka.kutepova@icloud.com',
  };
  assert.deepEqual(tickTickTaskDateKeys(task),['2026-09-21']);
  const calendar=buildTickTickCalendar([task],new Date('2026-09-20T06:00:00Z'),'month');
  const monday=calendar.days.find(day=>day.date==='2026-09-21');
  assert.equal(monday.events.length,1);
  assert.equal(monday.events[0].title,'🧼 Генеральная уборка');
});

test('task with distinct start and due dates is visible on both relevant days', () => {
  const task={
    id:'range-1',
    title:'Совместное дело',
    startDate:'2026-09-21T19:00:00+0300',
    dueDate:'2026-09-22T09:00:00+0300',
    isAllDay:false,
    status:0,
  };
  const calendar=buildTickTickCalendar([task],new Date('2026-09-20T06:00:00Z'),'month');
  assert.equal(calendar.days.find(day=>day.date==='2026-09-21').events.length,1);
  assert.equal(calendar.days.find(day=>day.date==='2026-09-22').events.length,1);
});


test('all-day Moscow task from TickTick UTC payload stays on 21 September', () => {
  const task = {
    id:'6a9aff5fdc5ed12946ec7d16',
    title:'🧼 Генеральная уборка',
    startDate:'2026-09-20T21:00:00.000+0000',
    dueDate:'2026-09-20T21:00:00.000+0000',
    timeZone:'Europe/Moscow',
    isAllDay:true,
    status:0,
  };
  assert.deepEqual(tickTickTaskDateKeys(task),['2026-09-21']);
  const calendar=buildTickTickCalendar([task],new Date('2026-09-21T08:00:00Z'),'month');
  assert.equal(calendar.days.find(day=>day.date==='2026-09-21').events[0].title,'🧼 Генеральная уборка');
  assert.equal(calendar.days.find(day=>day.date==='2026-09-20').events.length,0);
});

test('all-day Buy groceries task stays on 23 September, not 22', () => {
  const task = {
    id:'6a9aff30366a912946ec7b0b',
    title:'🛒 Купить продукты',
    startDate:'2026-09-22T21:00:00.000+0000',
    dueDate:'2026-09-22T21:00:00.000+0000',
    timeZone:'Europe/Moscow',
    isAllDay:true,
    status:0,
  };
  assert.deepEqual(tickTickTaskDateKeys(task),['2026-09-23']);
  const calendar=buildTickTickCalendar([task],new Date('2026-09-21T08:00:00Z'),'month');
  assert.equal(calendar.days.find(day=>day.date==='2026-09-23').events[0].title,'🛒 Купить продукты');
  assert.equal(calendar.days.find(day=>day.date==='2026-09-22').events.length,0);
});
