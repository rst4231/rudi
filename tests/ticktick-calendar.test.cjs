const test = require('node:test');
const assert = require('node:assert/strict');
const {
  buildTickTickCalendar,
  tickTickMonthRange,
  tickTickTaskDateKey,
} = require('../api/ticktick-client.cjs');

test('TickTick calendar builds current month and groups tasks by Moscow date', () => {
  const now = new Date('2026-09-20T08:00:00Z');
  const tasks = [
    { id:'1', title:'Шашлыки', startDate:'2026-09-21T15:00:00.000+0000', dueDate:'2026-09-21T17:00:00.000+0000', status:0 },
    { id:'2', title:'Дом', startDate:'2026-09-25T00:00:00.000+0000', isAllDay:true, status:0 },
    { id:'3', title:'Октябрь', startDate:'2026-10-01T12:00:00.000+0000', status:0 },
  ];
  const calendar = buildTickTickCalendar(tasks, now, 'month');
  assert.equal(calendar.view, 'month');
  assert.equal(calendar.days.length, 30);
  assert.equal(calendar.days.find((day) => day.date === '2026-09-21').events[0].title, 'Шашлыки');
  assert.equal(calendar.days.find((day) => day.date === '2026-09-25').events[0].allDay, true);
  assert.equal(calendar.days.some((day) => day.events.some((event) => event.title === 'Октябрь')), false);
});

test('TickTick calendar supports next month', () => {
  const range = tickTickMonthRange(new Date('2026-09-20T08:00:00Z'), 'next-month');
  assert.equal(range.startKey, '2026-10-01');
  const calendar = buildTickTickCalendar([
    { id:'1', title:'Октябрь', dueDate:'2026-10-03T12:00:00.000+0000', status:0 },
  ], new Date('2026-09-20T08:00:00Z'), 'next-month');
  assert.equal(calendar.days.length, 31);
  assert.equal(calendar.days.find((day) => day.date === '2026-10-03').events[0].title, 'Октябрь');
});

test('all-day TickTick task keeps its literal calendar date', () => {
  assert.equal(
    tickTickTaskDateKey({ startDate:'2026-09-30T00:00:00.000-0800', isAllDay:true }),
    '2026-09-30'
  );
});
