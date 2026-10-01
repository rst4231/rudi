const test = require('node:test');
const assert = require('node:assert/strict');
const {
  parseCarNoteCommand,
  canHandleCarNoteTelegram,
  processCarNoteTelegram,
} = require('../api/car-notes-telegram.cjs');

function request(text, user = { id:160628165, first_name:'Рустам' }) {
  return {
    body:{
      message:{
        text,
        from:user,
        chat:{ id:160628165, type:'private' },
      },
    },
  };
}

test('car note command extracts everything after trigger', () => {
  assert.deepEqual(
    parseCarNoteCommand({ text:'Сохрани в авто заметки купить масло 5W-30' }),
    { matched:true, text:'купить масло 5W-30' }
  );
  assert.deepEqual(
    parseCarNoteCommand({ text:'Сохрани в авто заметки: https://example.com/part' }),
    { matched:true, text:'https://example.com/part' }
  );
  assert.deepEqual(
    parseCarNoteCommand({ text:'Сохрани в авто заметки\nПроверить давление в шинах' }),
    { matched:true, text:'Проверить давление в шинах' }
  );
  assert.equal(parseCarNoteCommand({ text:'Просто сохрани это' }).matched, false);
});

test('car note command is handled before generic smart saves', () => {
  assert.equal(canHandleCarNoteTelegram(request('Сохрани в авто заметки проверить масло')), true);
});

test('empty car note command is consumed without creating a note', async () => {
  const calls = [];
  const fetchImpl = async (_url, init) => {
    calls.push(JSON.parse(init.body));
    return { ok:true, json:async()=>({ ok:true }) };
  };
  const result = await processCarNoteTelegram(request('Сохрани в авто заметки'), {
    token:'test-token',
    fetchImpl,
  });
  assert.equal(result.saved, false);
  assert.equal(result.skipped, 'empty-note');
  assert.match(calls[0].text, /Что сохранить/);
});
