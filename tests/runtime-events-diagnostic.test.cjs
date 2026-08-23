const test = require('node:test');
const fs = require('node:fs');
const path = require('node:path');

function snippets(source, needle, radius = 2500) {
  const out = [];
  let from = 0;
  while (true) {
    const index = source.indexOf(needle, from);
    if (index < 0) break;
    out.push(source.slice(Math.max(0, index - radius), Math.min(source.length, index + needle.length + radius)));
    from = index + needle.length;
  }
  return out.length ? out.join('\n\n--- OCCURRENCE ---\n\n') : `[missing:${needle}]`;
}

test('diagnose packed event entrypoints', () => {
  const source = fs.readFileSync(path.join(__dirname, '..', 'runtime', 'generated-runtime.cjs'), 'utf8');
  for (const needle of ['runNextDayDigest(', 'route === "daily"', 'route==="daily"', 'runMorningDigest(', 'module.exports']) {
    console.log(`\n===== DIAG ${needle} =====\n${snippets(source, needle)}\n===== END DIAG =====\n`);
  }
});
