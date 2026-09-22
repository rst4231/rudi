const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');

const app = fs.readFileSync('public/app.js','utf8');
const css = fs.readFileSync('public/app.css','utf8');
const indexHtml = fs.readFileSync('public/index.html','utf8');
const smart = fs.readFileSync('public/smart-home.js','utf8');
const car = fs.readFileSync('public/car.js','utf8');
const partner = fs.readFileSync('api/partner-message.js','utf8');
const smartServer = fs.readFileSync('api/smart-home-client.cjs','utf8');
const carServer = fs.readFileSync('api/car-client.cjs','utf8');

test('Safari login uses RUDI browser auth and keeps the two explicit identities', () => {
  assert.match(app, /rudiAction=browser-auth/);
  assert.match(app, /\['Рустам','Диана'\]/);
  assert.match(app, /operation,'create-pin'|browserAuthRequest\('create-pin'/);
  assert.match(app, /browserAuthRequest\('login'/);
  assert.match(app, /rudi-pin-rate-limited/);
  assert.match(app, /PIN ещё не создан/);
});

test('browser login gate hides the application until authentication succeeds', () => {
  assert.match(css, /body\.auth-login \.shell/);
  assert.match(css, /body\.auth-login \.app-tabbar/);
  assert.match(css, /body\.auth-login \.app-gate-loader/);
  assert.match(css, /\.rudi-auth-pin/);
  assert.match(css, /\.rudi-auth-actor\.is-active/);
});

test('authenticated browser sessions unlock app data without Telegram initData guards', () => {
  assert.doesNotMatch(app, /if\(!currentActor\|\|!tg\?\.initData\)/);
  assert.doesNotMatch(app, /if\(!tg\?\.initData\) return;/);
  assert.match(app, /async function loadAppBootstrap\(\)\{\s*if\(!currentActor\) return;/);
  assert.match(app, /const canEdit=Boolean\(currentActor\)/);
});

test('smart home and car start after RUDI auth rather than requiring Telegram WebView', () => {
  assert.doesNotMatch(smart, /if\(!tg\?\.initData\|\|state\.loading\)/);
  assert.doesNotMatch(car, /if\(!tg\?\.initData \|\| state\.loading\)/);
  assert.match(smart, /document\.body\.classList\.contains\('auth-ok'\)/);
  assert.match(car, /document\.body\.classList\.contains\('auth-ok'\)/);
});

test('server routes preserve Telegram auth but accept the signed RUDI session fallback', () => {
  assert.match(partner, /authorizeWithSession/);
  assert.match(partner, /const telegram = authorizeInitData\(body\.initData, options\)/);
  assert.match(partner, /if \(session\.source === 'telegram'\)/);
  assert.match(smartServer, /authorizeWithSession/);
  assert.match(carServer, /authorizeWithSession/);
});

test('Safari bootstrap never rewrites Telegram notification recipients without a Telegram user id', () => {
  const guarded = partner.match(/else if \(user\?\.id\) \{\s*await saveRecipient\(actor, user\?\.id,/g) || [];
  assert.ok(guarded.length >= 2);
});

test('browser-local block state is separated for Rustam and Diana', () => {
  assert.match(app, /currentActor==='Диана'\?'diana':'rustam'/);
  assert.doesNotMatch(app, /initDataUnsafe\?\.user\?\.id\|\|'local'/);
});

test('Face ID passkeys preserve the native iOS user gesture and fall back safely to PIN', () => {
  assert.match(app, /function passkeySupported\(\)/);
  assert.match(app, /PublicKeyCredential\?\.parseCreationOptionsFromJSON/);
  assert.match(app, /PublicKeyCredential\?\.parseRequestOptionsFromJSON/);
  assert.match(app, /prepareFaceIdRegistration\(\)/);
  assert.match(app, /finishFaceIdRegistration\(prepared,credentialPromise\)/);
  assert.match(app, /prepareFaceIdAuthentication\(\)/);
  assert.match(app, /finishFaceIdAuthentication\(preparedFaceIdLogin,credentialPromise\)/);
  assert.match(app, /credentialPromise=navigator\.credentials\.create\(\{publicKey:prepared\.publicKey\}\)/);
  assert.match(app, /credentialPromise=navigator\.credentials\.get\(\{publicKey:preparedFaceIdLogin\.publicKey\}\)/);
  assert.match(app, /Войти с Face ID/);
  assert.match(app, /Включить Face ID/);
  assert.match(partner, /action === 'passkey'/);
  assert.match(partner, /setSessionCookie\(res, verified\.actor/);
});

test('passkey enrollment requires an authenticated RUDI user while passkey login can establish a session', () => {
  const start=partner.indexOf("if (action === 'passkey')");
  const end=partner.indexOf("if (action === 'browser-auth')",start);
  assert.ok(start>=0&&end>start);
  const block=partner.slice(start,end);
  assert.match(block, /operation === 'auth-options'/);
  assert.match(block, /operation === 'auth-verify'/);
  assert.match(block, /const session = authorizeRequest\(req, body\.initData, options\)/);
  assert.match(block, /operation === 'register-options'/);
  assert.match(block, /operation === 'register-verify'/);
});

test('PIN enrollment gate stays locked while Telegram keyboard and focus events fire', () => {
  assert.match(app, /let appAccessReady = false;/);
  assert.match(app, /async function authenticateApp\(\)\{\s*appAccessReady=false;/);
  assert.match(app, /if\(telegramInitData\(\)\) await ensureTelegramPin\(\);\s*await loadAppBootstrap\(\);\s*appAccessReady=true;\s*return true;/);
  assert.match(app, /function ensureAppSurface\([\s\S]*?if\(!currentActor\|\|!appAccessReady\) return;/);
  assert.match(app, /async function refreshAfterResume\(\)[\s\S]*?if\(!currentActor\|\|!appAccessReady\) return;/);
  assert.match(app, /tg\?\.onEvent\?\.\('viewportChanged',[\s\S]*?ensureAppSurface/);
  assert.match(app, /window\.addEventListener\('focus',[\s\S]*?ensureAppSurface/);
});

test('Telegram PIN enrollment migrates backup auth into the shared durable server record', () => {
  assert.match(app,/async function browserAuthRequest[\s\S]*?backupToken:currentStateBackupToken/);
  assert.match(app,/async function browserAuthRequest[\s\S]*?if\(data\.backupToken\) await storeStateBackupToken\(data\.backupToken\)/);
  assert.match(app,/async function ensureTelegramPin[\s\S]*?readStateBackupToken\(\)[\s\S]*?browserAuthRequest\('status'\)/);
  assert.match(partner,/async function hydrateActorAuth[\s\S]*?saveDurablePinRecord\(actor, backupPin, dbOptions\)/);
  assert.match(partner,/operation === 'create-pin'[\s\S]*?saveDurablePinRecord\(telegram\.actor, result\.record, durableAuthOptions\(options\)\)/);
  assert.match(partner,/operation === 'status'[\s\S]*?hydrateActorAuth\(session\.actor, body\.backupToken, options\)[\s\S]*?Boolean\(hydrated\.durable\?\.pinRecord\)/);
});


test('existing PIN migrates from restored runtime cache into durable Postgres auth', () => {
  assert.match(partner,/readPinRecord/);
  assert.match(partner,/async function hydrateActorAuth[\s\S]*?readPinRecord\(actor, storeOptions\)[\s\S]*?saveDurablePinRecord\(actor, cachedPin, dbOptions\)/);
  assert.match(partner,/operation === 'login'[\s\S]*?hydrateActorAuth\(actor, body\.backupToken, options\)/);
  assert.match(partner,/if \(!hydrated\.durable\?\.pinRecord\) throw new Error\('rudi-pin-not-configured'\)/);
});


test('browser theme follows device outside Telegram and updates live', () => {
  assert.match(app,/const telegramOpen=Boolean\(tg\?\.initData\)/);
  assert.match(app,/const theme=telegramOpen&&tg\?\.colorScheme[\s\S]*?media\.matches\?'dark':'light'/);
  assert.match(app,/handleSystemThemeChange/);
  assert.match(app,/if\(typeof media\.addEventListener==='function'\) media\.addEventListener\('change',handleSystemThemeChange\)/);
});

test('browser pull to refresh only activates outside Telegram from the page top', () => {
  assert.match(app,/touchstart/);
  assert.match(app,/touchmove/);
  assert.match(app,/touchend/);
  assert.match(app,/if\(tg\?\.initData\|\|!\('ontouchstart' in window\)\) return/);
  assert.match(app,/if\(scrollTop\(\)>0\)\{reset\(\);return\}/);
  assert.match(app,/window\.location\.reload\(\)/);
});

test('home screen icon and detailed car header are wired in v1.7.6', () => {
  assert.match(indexHtml,/apple-touch-icon-v176\.jpg\?v=1\.7\.6/);
  assert.match(indexHtml,/manifest\.webmanifest\?v=1\.7\.6/);
  assert.match(indexHtml,/car-head-visual/);
  assert.match(indexHtml,/changan-uni-v-header\.jpg\?v=1\.7\.6/);
  assert.doesNotMatch(indexHtml,/car-head-chevron|car-chevron/);
});
