const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const read=p=>fs.readFileSync(p,'utf8');

test('v4.29 app bootstrap sends response before backup recovery',()=>{
  const api=read('api/partner-message.js');
  const start=api.indexOf("if (action === 'app-bootstrap')");
  const end=api.indexOf("if (action === 'state-backup-recovery')",start);
  assert.ok(start>=0&&end>start);
  const block=api.slice(start,end);
  assert.doesNotMatch(block,/await restoreStateBackup/);
  assert.match(api,/function scheduleStateBackupRestore\(token, options = \{\}\)/);
  assert.match(api,/try \{ waitUntil\(task\); \}/);
  const responseAt=block.indexOf('const response = res.status(200).json');
  const restoreAt=block.indexOf('scheduleStateBackupRestore(body.backupToken, options)');
  assert.ok(responseAt>=0&&restoreAt>responseAt);
  assert.match(block,/return response;/);
});

test('v4.29 backup recovery avoids unchanged auth writes',()=>{
  const backup=read('api/rudi-backup.cjs');
  assert.match(backup,/if \(!currentPin \|\| savedTime > currentTime\)/);
  assert.doesNotMatch(backup,/savedTime >= currentTime/);
  assert.match(backup,/const currentPasskeys = await readPasskeys\(actor, options\)/);
  assert.match(backup,/JSON\.stringify\(mergedPasskeys\) !== JSON\.stringify\(currentPasskeys\)/);
});
