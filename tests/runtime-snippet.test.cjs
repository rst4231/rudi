const test = require('node:test');
const fs = require('node:fs');
const path = require('node:path');

test('print daily digest runtime snippets for maintenance diagnosis', () => {
  const source = fs.readFileSync(path.join(__dirname, '..', 'runtime', 'generated-runtime.cjs'), 'utf8');
  for (const marker of ['runFactsDigest', 'runMorningDigest']) {
    const index = source.indexOf(marker);
    console.log(`RUNTIME_SNIPPET_${marker}\n${source.slice(Math.max(0, index - 1800), index + 5000)}\nEND_RUNTIME_SNIPPET_${marker}`);
  }
});
