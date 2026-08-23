const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { buildRuntime } = require('../build.cjs');

function runtimeSource() {
  buildRuntime();
  return fs.readFileSync(path.join(__dirname, '..', 'runtime', 'generated-runtime.cjs'), 'utf8');
}

test('events runtime retries and isolates Yandex and Stage source failures', () => {
  const source = runtimeSource();
  assert.match(source, /async function retryEventSource\(/);
  assert.match(source, /Promise\.allSettled\(\[retryEventSource\("yandex"/);
  assert.match(source, /retryEventSource\("stage"/);
  assert.match(source, /if\(yandexResult\.status==="fulfilled"\) messages\.push\(concertsMessage/);
  assert.match(source, /if\(stageResult\.status==="fulfilled"\) messages\.push\(stageMessage/);
});

test('Yandex concerts rubric failure is not reported as an empty concert day', () => {
  const source = runtimeSource();
  assert.match(source, /let concertRubricSucceeded=false/);
  assert.match(source, /if\(RELEVANT_RUBRICS\[index\]==="concert"\) concertRubricSucceeded=true/);
  assert.match(source, /if\(!concertRubricSucceeded\) throw new Error\("Яндекс Афиша: раздел концертов недоступен"\)/);
});
