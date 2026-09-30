const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');

test('Deno proxy never caches failed versioned assets as immutable',()=>{
  const proxy=fs.readFileSync(path.join(__dirname,'..','render-proxy.cjs'),'utf8');
  assert.match(proxy,/upstream\.ok\s*\?\s*'public, max-age=31536000, immutable'\s*:\s*'no-store'/);
});
