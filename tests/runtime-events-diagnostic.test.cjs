const test = require('node:test');
const fs = require('node:fs');
const path = require('node:path');

function snippet(source, needle, radius = 7000) {
  const index = source.toLowerCase().indexOf(needle.toLowerCase());
  if (index < 0) return `[missing:${needle}]`;
  return source.slice(Math.max(0, index - radius), Math.min(source.length, index + needle.length + radius));
}

test('diagnose packed recipe runtime', () => {
  const source = fs.readFileSync(path.join(__dirname, '..', 'runtime', 'generated-runtime.cjs'), 'utf8');
  for (const needle of [
    'RECIPE_HISTORY_KEY',
    'recipe-history-v2',
    'function recipe',
    'function pick',
    'nextRecipe',
    'runMorningDigest',
    'morning-digest',
    'THREADS={lulu:85,recipe:88}',
  ]) {
    console.log(`\n===== DIAG ${needle} =====\n${snippet(source, needle)}\n===== END DIAG =====\n`);
  }
});
