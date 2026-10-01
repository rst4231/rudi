const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const { parseCarNoteCommand } = require('../api/car-notes-telegram.cjs');

const COMMANDS = [
  'Сохрани в авто заметки',
  'Сохрани в заметки авто',
  'Сохрани в заметки машины',
  'Добавь в авто заметки',
  'Добавь в заметки машины',
  'Добавь заметку по машине',
  'Запиши в авто заметки',
  'Запиши в заметки машины',
  'Запиши по машине',
  'Сохрани по машине',
  'Заметка по машине',
  'Заметка в авто',
  'Авто заметка',
  'В заметки авто',
  'В заметки машины',
  'Для машины сохрани',
  'По машине сохрани',
  'Сохрани для машины',
  'Добавь для машины',
  'Закинь в заметки машины',
  'Кинь в авто заметки',
  'Запомни по машине',
  'Сохрани это по машине',
  'Добавь в авто',
];

test('all supported car note phrases extract the note text', () => {
  for (const command of COMMANDS) {
    assert.deepEqual(
      parseCarNoteCommand({ text:command + ': проверить масло и давление' }),
      { matched:true, text:'проверить масло и давление' },
      command
    );
  }
});

test('car note command preserves links and multiline text', () => {
  assert.deepEqual(
    parseCarNoteCommand({ text:'Добавь в авто https://example.com/part' }),
    { matched:true, text:'https://example.com/part' }
  );
  assert.deepEqual(
    parseCarNoteCommand({ text:'Сохрани по машине\nПроверить давление\nКупить масло' }),
    { matched:true, text:'Проверить давление\nКупить масло' }
  );
});

test('empty supported command is consumed but ordinary text is not', () => {
  assert.deepEqual(
    parseCarNoteCommand({ text:'Добавь в авто' }),
    { matched:true, text:'' }
  );
  assert.equal(parseCarNoteCommand({ text:'Добавь встречу в календарь' }).matched, false);
  assert.equal(parseCarNoteCommand({ text:'Просто сохрани это' }).matched, false);
  assert.equal(parseCarNoteCommand({ text:'Машина сегодня чистая' }).matched, false);
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
