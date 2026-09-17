const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');

function absent(file, patterns) {
  const source = read(file);
  for (const pattern of patterns) assert.doesNotMatch(source, pattern, `${file} still contains ${pattern}`);
}

test('Lulu, weekend plans and recipes are fully retired from active app code and UI', () => {
  absent('config/rudi-settings.json', [/"lulu"\s*:/i, /"recipes"\s*:/i, /"weekend"\s*:/i, /weekendDays/i]);
  absent('api/rudi-settings.cjs', [/['"]lulu['"]/, /['"]recipes['"]/, /['"]weekend['"]/, /weekendDays/]);
  absent('api/section-runners.cjs', [/weekend/i]);
  absent('api/preview-sections.cjs', [/lulu/i, /recipes/i, /weekend/i]);
  absent('api/daily-orchestrator.cjs', [/lulu/i, /recipes/i, /weekend/i]);
  absent('api/daily-content-dedupe.cjs', [/LULU_TOPIC_ID/, /type === ['"]lulu['"]/, /Для Лулу/]);
  absent('api/topic-maintenance.cjs', [/LULU_TOPIC_ID/]);
  absent('build.cjs', [/recipes-extra/i, /patchRecipeRuntime/, /isRecipePublicationDay/]);
  absent('public/index.html', [/Антидубли/i, /Футеры/i, /Источники контента/i, /lulu/i, /recipes/i, /weekend/i]);
  absent('public/admin.html', [/Overrides/i, /Аналитика рубрик/i, /lulu/i, /recipes/i, /weekend/i]);
  absent('config/daily-content-sequence.json', [/lulu/i]);
  absent('config/daily-content.json', [/"lulu"\s*:/i, /"type"\s*:\s*"lulu"/i, /lulu-/i]);

  assert.equal(fs.existsSync(path.join(root, 'api/weekend-digest.cjs')), false);
  assert.equal(fs.existsSync(path.join(root, 'config/recipes-extra.json')), false);
});
