const test = require('node:test');
const assert = require('node:assert/strict');
const { publishSelectedSection } = require('../api/manual-section-publisher.cjs');

const settings = {
  sections: {
    events: { enabled: true, topicId: 19 },
    holidays: { enabled: true, topicId: 20 },
    facts: { enabled: true, topicId: 72 },
    clients: { enabled: true, topicId: 126 },
    cinema: { enabled: true },
    labor: { enabled: true },
  },
  copy: { footers: {} },
};

const preview = {
  results: {
    events: { preview: { concerts: 'concert', stage: 'stage' } },
    holidays: { preview: { message: 'holiday' } },
    facts: { preview: { message: 'fact' } },
    clients: { preview: { message: 'client' } },
  },
};

test('retired facts section cannot be published manually', async () => {
  await assert.rejects(() => publishSelectedSection({ section: 'facts', date: '2026-08-30' }, {
    settingsLoader: async () => ({ settings }),
  }), /unknown section/);
});

test('published active section is blocked unless force is explicit', async () => {
  const result = await publishSelectedSection({ section: 'events', date: '2026-08-30' }, {
    settingsLoader: async () => ({ settings }),
    getRecord: async () => ({ status: 'published' }),
  });
  assert.deepEqual(result, { ok: false, error: 'already-published', section: 'events', date: '2026-08-30' });
});

test('retired manual section is rejected', async () => {
  await assert.rejects(() => publishSelectedSection({ section: 'recipes', date: '2026-08-30' }, {
    settingsLoader: async () => ({ settings }),
  }), /unknown section/);
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
