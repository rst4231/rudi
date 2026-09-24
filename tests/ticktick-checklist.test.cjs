const test = require('node:test');
const assert = require('node:assert/strict');

const {
  OAUTH_SCOPE,
  buildAuthorizeUrl,
  checklistUpdateBody,
  updateTaskChecklistItem,
  visibleChecklistItems,
} = require('../api/ticktick-client.cjs');
const {
  recordChecklistAudit,
  readChecklistAuditState,
  checklistAuditForItem,
} = require('../api/ticktick-checklist-audit-store.cjs');

function response(status, body) {
  return {
    status,
    ok: status >= 200 && status < 300,
    json: async () => body,
  };
}

test('TickTick OAuth asks for read and write scopes', () => {
  assert.equal(OAUTH_SCOPE, 'tasks:read tasks:write');
  const url = new URL(buildAuthorizeUrl({
    clientId: 'client',
    redirectUri: 'https://example.com/callback',
    state: 'state',
  }));
  assert.equal(url.searchParams.get('scope'), 'tasks:read tasks:write');
});


test('RUDI hides completed TickTick checklist items before applying the 50-item limit', () => {
  const completed = Array.from({ length: 50 }, (_, index) => ({
    id: 'done-' + index,
    title: 'Done ' + index,
    status: 1,
  }));
  const active = [
    { id: 'todo-1', title: 'Todo 1', status: 0 },
    { id: 'todo-2', title: 'Todo 2', status: 0 },
  ];
  const visible = visibleChecklistItems([...completed, ...active], 50);
  assert.deepEqual(visible.map((item) => item.id), ['todo-1', 'todo-2']);
});

test('checklist update changes only the requested item', () => {
  const task = {
    id: 'task-1',
    projectId: 'project-1',
    title: 'Trip',
    items: [
      { id: 'a', title: 'Water', status: 0, sortOrder: 1 },
      { id: 'b', title: 'Meat', status: 0, sortOrder: 2 },
    ],
  };
  const body = checklistUpdateBody(task, 'b', true, new Date('2026-09-20T04:00:00Z'));
  assert.equal(body.id, 'task-1');
  assert.equal(body.projectId, 'project-1');
  assert.equal(body.items[0].status, 0);
  assert.equal(body.items[1].status, 1);
  assert.match(body.items[1].completedTime, /^2026-09-20T04:00:00\+0000$/);
});

test('unchecking a checklist item clears completion state', () => {
  const task = {
    id: 'task-1',
    projectId: 'project-1',
    title: 'Trip',
    items: [
      { id: 'a', title: 'Water', status: 1, completedTime: '2026-09-20T03:00:00+0000' },
    ],
  };
  const body = checklistUpdateBody(task, 'a', false, new Date('2026-09-20T04:00:00Z'));
  assert.equal(body.items[0].status, 0);
  assert.equal('completedTime' in body.items[0], false);
});

test('TickTick checklist sync fetches task then posts updated items', async () => {
  const calls = [];
  const fetchImpl = async (url, init = {}) => {
    calls.push({ url: String(url), init });
    if (!init.method || init.method === 'GET') {
      return response(200, {
        id: 'task-1',
        projectId: 'project-1',
        title: 'Trip',
        items: [
          { id: 'a', title: 'Water', status: 0 },
          { id: 'b', title: 'Meat', status: 0 },
        ],
      });
    }
    const body = JSON.parse(init.body);
    return response(200, { ...body });
  };

  const result = await updateTaskChecklistItem(
    'token',
    'project-1',
    'task-1',
    'a',
    true,
    { fetchImpl, now: new Date('2026-09-20T04:00:00Z') }
  );

  assert.equal(calls.length, 2);
  assert.match(calls[0].url, /\/project\/project-1\/task\/task-1$/);
  assert.match(calls[1].url, /\/task\/task-1$/);
  assert.equal(JSON.parse(calls[1].init.body).items[0].status, 1);
  assert.equal(Number(result.item.status), 1);
});

test('RUDI remembers who checked or unchecked a TickTick item', async () => {
  const values = new Map();
  const cache = {
    async get(key) { return values.has(key) ? values.get(key) : null; },
    async set(key, value) { values.set(key, structuredClone(value)); return true; },
  };
  const options = {
    ticktickChecklistAuditCache: cache,
    now: new Date('2026-09-20T04:05:00Z'),
  };

  await recordChecklistAudit('task-1', 'a', true, 'Рустам', options);
  let state = await readChecklistAuditState(options);
  let row = checklistAuditForItem(state, 'task-1', 'a', true);
  assert.equal(row.actor, 'Рустам');
  assert.equal(row.completed, true);
  assert.equal(checklistAuditForItem(state, 'task-1', 'a', false), null);

  options.now = new Date('2026-09-20T04:06:00Z');
  await recordChecklistAudit('task-1', 'a', false, 'Диана', options);
  state = await readChecklistAuditState(options);
  row = checklistAuditForItem(state, 'task-1', 'a', false);
  assert.equal(row.actor, 'Диана');
  assert.equal(row.completed, false);
});


test('RUDI refreshes TickTick checklist ids after each successful toggle', () => {
  const app = require('fs').readFileSync('public/app.js','utf8');
  assert.match(app, /const checklistRows=\[\.\.\.\(checklist\?\.querySelectorAll\('\.ticktick-check-item'\)\|\|\[\]\)\];/);
  assert.match(app, /await loadTickTickNext\(\{preserveExpanded:true\}\);/);
  assert.match(app, /async function loadTickTickNext\(\{preserveExpanded=false,force=false,retryOnAbort=true\}=\{\}\)/);
  assert.match(app, /renderTickTickTodayState\(payload,\{preserveExpanded\}\)/);
});
