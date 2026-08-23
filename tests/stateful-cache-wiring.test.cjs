const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
function src(name){return fs.readFileSync(path.join(__dirname,'..','api',name),'utf8');}

test('topic maintenance wrapper injects strict cache for requests cleanup and chat-id reads', () => {
  const source=src('topic-maintenance.cjs');
  assert.match(source,/getTopicMaintenanceCache/);
  assert.match(source,/cache: resolveTopicCache\(options\)/);
  assert.match(source,/base\.getKnownForumChatId\(\{ \.\.\.options, cache: resolveTopicCache\(options\) \}\)/);
});

test('daily labor path injects strict content and lease caches', () => {
  const source=src('index.js');
  assert.match(source,/publishLaborArticle\(\{[\s\S]*?token,[\s\S]*?chatId,[\s\S]*?cache: getLaborCache\(\)/);
  assert.match(source,/withLaborPublicationLease[\s\S]*\{ cache: getLaborLeaseCache\(\) \}/);
});
