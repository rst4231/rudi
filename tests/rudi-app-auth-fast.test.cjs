const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');

const api=fs.readFileSync('api/partner-message.js','utf8');

test('app auth does not block on Runtime Cache write confirmation',()=>{
  const start=api.indexOf("if (action === 'app-auth')");
  const end=api.indexOf("if (action === 'state-backup')",start);
  assert.ok(start>=0&&end>start);
  const block=api.slice(start,end);
  assert.doesNotMatch(block,/RUDI_RECIPIENT_SELF_REGISTER_WARN/);
  assert.match(block,/restoreStateBackup\(body\.backupToken,[\s\S]*?confirmWrites: false/);
  assert.match(block,/saveRecipient\(actor, user\?\.id,[\s\S]*?confirmWrites: false/);
});
