const test = require('node:test');
const fs = require('node:fs');
const path = require('node:path');

function snippet(source, needle, radius = 6000) {
  const index = source.toLowerCase().indexOf(needle.toLowerCase());
  if (index < 0) return `[missing:${needle}]`;
  return source.slice(Math.max(0, index - radius), Math.min(source.length, index + needle.length + radius));
}

test('diagnose packed events runtime', () => {
  const source = fs.readFileSync(path.join(__dirname, '..', 'runtime', 'generated-runtime.cjs'), 'utf8');
  for (const needle of [
    'async function runNextDayDigest',
    'async function fetchStageStandupEvents',
    'YANDEX_AFISHA_BASE_URL',
    'async function fetchYandex',
    'async function fetchConcert',
    'Promise.all',
  ]) {
    console.log(`\n===== DIAG ${needle} =====\n${snippet(source, needle)}\n===== END DIAG =====\n`);
  }
});
