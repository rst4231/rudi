const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const { parseCarNoteCommand } = require('../api/car-notes-telegram.cjs');

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
  assert.deepEqual(
    parseCarNoteCommand({ text:'Сохрани в авто заметки' }),
    { matched:true, text:'' }
  );
  assert.equal(parseCarNoteCommand({ text:'Просто сохрани это' }).matched, false);
});

test('car note handler runs before generic smart saves', () => {
  const source = fs.readFileSync('api/index.js','utf8');
  const routeStart = source.indexOf("if (req.query?.route === 'telegram')");
  const carNote = source.indexOf('scheduleCarNoteTelegram', routeStart);
  const smartSave = source.indexOf('scheduleSmartSaveTelegram', routeStart);
  assert.ok(routeStart >= 0);
  assert.ok(carNote > routeStart);
  assert.ok(smartSave > carNote);
});

test('empty command is explicitly handled by car note module', () => {
  const source = fs.readFileSync('api/car-notes-telegram.cjs','utf8');
  assert.match(source,/skipped:'empty-note'/);
  assert.match(source,/Что сохранить в авто-заметки/);
});
