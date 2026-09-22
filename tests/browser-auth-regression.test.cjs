const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');

const app=fs.readFileSync('public/app.js','utf8');
const smart=fs.readFileSync('public/smart-home.js','utf8');
const car=fs.readFileSync('public/car.js','utf8');
const api=fs.readFileSync('api/partner-message.js','utf8');
const smartApi=fs.readFileSync('api/smart-home-client.cjs','utf8');
const carApi=fs.readFileSync('api/car-client.cjs','utf8');

test('Safari login is available without Telegram while Telegram auth remains supported',()=>{
  assert.match(app,/function showBrowserLogin\(\)/);
  assert.match(app,/rudiAction=browser-auth/);
  assert.match(app,/body:JSON\.stringify\(\{initData:telegramInitData\(\)\}\)/);
  assert.match(api,/authorizeWithSession/);
  assert.match(api,/if \(action === 'browser-auth'\)/);
  assert.match(api,/if \(session\.source === 'telegram'\)/);
  assert.match(api,/setSessionCookie\(res, session\.actor/);
});

test('authenticated browser sessions unlock app features without requiring Telegram initData',()=>{
  assert.doesNotMatch(app,/if\(!tg\?\.initData\) return;/);
  assert.doesNotMatch(app,/if\(!tg\?\.initData\) return null;/);
  assert.doesNotMatch(smart,/if\(!tg\?\.initData\|\|state\.loading\)return;/);
  assert.doesNotMatch(car,/if\(!tg\?\.initData \|\| state\.loading\) return;/);
  assert.match(smart,/document\.body\.classList\.contains\('auth-ok'\)/);
  assert.match(car,/document\.body\.classList\.contains\('auth-ok'\)/);
});

test('browser session preserves server-side actor authorization for smart home and car',()=>{
  assert.match(smartApi,/authorizeWithSession/);
  assert.match(smartApi,/session\.actor !== 'Рустам'/);
  assert.match(carApi,/authorizeWithSession/);
  assert.match(carApi,/session\.actor !== 'Рустам'/);
});

test('browser bootstrap never rewrites Telegram recipients without a Telegram user id',()=>{
  assert.match(api,/else if \(user\?\.id\) \{\s*await saveRecipient\(actor, user\?\.id,/);
});

test('browser local UI state remains separated for Rustam and Diana',()=>{
  assert.match(app,/currentActor==='Диана'\?'diana':'rustam'/);
  assert.match(app,/rudi:block-state:v2:/);
});

test('PIN setup is only offered to an already authenticated Telegram user',()=>{
  assert.match(app,/if\(!telegramInitData\(\)\) return true;/);
  assert.match(app,/browserAuthRequest\('create-pin'/);
  assert.match(api,/const telegram = authorizeInitData\(body\.initData, options\)/);
  assert.match(api,/await savePin\(telegram\.actor/);
});
