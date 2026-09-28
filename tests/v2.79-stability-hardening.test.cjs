const test=require('node:test');const assert=require('node:assert/strict');const fs=require('node:fs');const path=require('node:path');
const read=p=>fs.readFileSync(path.join(__dirname,'..',p),'utf8');
test('v2.79 cron health and timeout hardening',()=>{const s=read('api/daily-cron.js');assert.ok(s.indexOf("if (!authorized)")<s.indexOf("status: 'started'"));assert.match(s,/DAILY_CRON_TIMEOUT_MS = 270000/);assert.match(s,/await withTimeout\(work\)/);});
test('v2.79 closes skipped native journal entries',()=>{const s=read('api/section-runners.cjs');assert.match(s,/markPublicationSkipped/);assert.match(s,/await skipped\(\{ date, section, reason:/);assert.match(s,/journalRecovered: true/);});
test('v2.79 retries structured Groq failures',()=>{assert.match(read('api/recipe-ai.cjs'),/recipe-ai-structured-output/);assert.match(read('api/date-ai.cjs'),/date-ai-structured-output/);});
test('v2.79 enforces habit Done time in storage',()=>{const s=read('api/habit-tracker-store.cjs');assert.match(s,/nextStatus==='done'.*moscowHour\(now\)<20.*habit-done-too-early/);});
test('v2.79 treats delayed cache visibility as warning, not failed set',()=>{const s=read('api/strict-runtime-cache.cjs');assert.match(s,/RUDI_RUNTIME_CACHE_CONFIRM_WARN/);assert.match(s,/write not yet visible/);});

test('v2.79 does not require Runtime Cache read-after-write confirmation by default',()=>{const s=read('api/strict-runtime-cache.cjs');assert.match(s,/const confirmWrites = options\.confirmWrites === true/);});
