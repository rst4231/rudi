const test = require('node:test');
const assert = require('node:assert/strict');
const { publishSelectedSection } = require('../api/manual-section-publisher.cjs');

const settings = {
  sections: {
    events: { enabled: true, topicId: 19 },
    holidays: { enabled: true, topicId: 20 },
    facts: { enabled: true, topicId: 72 },
    lulu: { enabled: true, topicId: 73 },
    recipes: { enabled: true, topicId: 74 },
    clients: { enabled: true, topicId: 126 },
    cinema: { enabled: true },
    labor: { enabled: true },
    weekend: { enabled: true },
  },
  copy: { footers: {} },
};

const preview = {
  results: {
    events: { preview: { concerts: 'concert', stage: 'stage' } },
    holidays: { preview: { message: 'holiday' } },
    facts: { preview: { message: 'fact' } },
    morning: { preview: { lulu: 'lulu', recipes: ['breakfast', 'lunch', 'snack', 'dinner'] } },
    clients: { preview: { message: 'client' } },
  },
};

test('publishing facts sends only facts topic message and records its message id', async () => {
  const sends = [];
  const journal = [];
  const result = await publishSelectedSection({ section: 'facts', date: '2026-08-30' }, {
    settingsLoader: async () => ({ settings }),
    previewProvider: async () => preview,
    getRecord: async () => null,
    getOverride: async () => null,
    sendTelegram: async (payload) => { sends.push(payload); return { messageId: 101 }; },
    markPending: async (row) => { journal.push(['pending', row]); },
    markPublished: async (row) => { journal.push(['published', row]); },
    markFailed: async () => {},
  });
  assert.deepEqual(sends.map((row) => row.topicId), [72]);
  assert.deepEqual(sends.map((row) => row.text), ['fact']);
  assert.deepEqual(result.messageIds, [101]);
  assert.equal(journal.at(-1)[0], 'published');
  assert.deepEqual(journal.at(-1)[1].messageIds, [101]);
});

test('recipe manual publish preserves all preview parts and no other topic', async () => {
  const sends = [];
  await publishSelectedSection({ section: 'recipes', date: '2026-08-30' }, {
    settingsLoader: async () => ({ settings }),
    previewProvider: async () => preview,
    getRecord: async () => null,
    getOverride: async () => ({ parts: ['b2', 'l2', 's2', 'd2'] }),
    sendTelegram: async (payload) => { sends.push(payload); return { messageId: 200 + sends.length }; },
    markPending: async () => {},
    markPublished: async () => {},
    markFailed: async () => {},
  });
  assert.deepEqual(sends.map((row) => row.topicId), [74, 74, 74, 74]);
  assert.deepEqual(sends.map((row) => row.text), ['b2', 'l2', 's2', 'd2']);
});

test('published section is blocked unless force is explicit', async () => {
  const result = await publishSelectedSection({ section: 'facts', date: '2026-08-30' }, {
    settingsLoader: async () => ({ settings }),
    getRecord: async () => ({ status: 'published' }),
  });
  assert.deepEqual(result, { ok: false, error: 'already-published', section: 'facts', date: '2026-08-30' });
});

test('native section delegates to native runner without previewing generated runtime', async () => {
  const calls = [];
  const result = await publishSelectedSection({ section: 'cinema', date: '2026-08-30', force: true }, {
    settingsLoader: async () => ({ settings }),
    getRecord: async () => null,
    previewProvider: async () => { throw new Error('preview must not run'); },
    runNative: async (section, options) => { calls.push([section, options.force]); return { published: 2 }; },
  });
  assert.deepEqual(calls, [['cinema', true]]);
  assert.equal(result.published, 2);
});

test('forced native cinema repair receives the previous published message ids', async () => {
  const previous = { status: 'published', messageIds: [823], metadata: { nativeResult: { published: 5 } } };
  let received = null;
  await publishSelectedSection({ section: 'cinema', date: '2026-09-03', force: true }, {
    settingsLoader: async () => ({ settings }),
    getRecord: async () => previous,
    runNative: async (_section, options) => {
      received = options.previousPublication;
      return { published: 7, messageId: 900 };
    },
  });
  assert.deepEqual(received, previous);
});
