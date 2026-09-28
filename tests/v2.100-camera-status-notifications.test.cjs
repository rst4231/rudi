const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');

const client=fs.readFileSync('api/smart-home-client.cjs','utf8');

test('v2.100 disables camera online/offline Telegram notifications but keeps status tracking',()=>{
  assert.match(client,/function observeCameraStatus\(/);
  assert.match(client,/cameraStatusCache\(/);
  assert.match(client,/previous\.state===state/);
  assert.doesNotMatch(client,/Камера снова онлайн|Камера офлайн/);
  assert.doesNotMatch(client,/telegramSendMessage/);
  assert.doesNotMatch(client,/readRecipients/);
  assert.doesNotMatch(client,/cameraRecipients|RUDI_CAMERA_STATUS_NOTIFY_WARN/);
});
