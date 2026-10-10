const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs');
const js=fs.readFileSync('public/app.js','utf8');
const css=fs.readFileSync('public/app.css','utf8');
const html=fs.readFileSync('public/index.html','utf8');
test('question opens until answered and keeps accessible disclosure state',()=>{
 assert.match(js,/const shouldCollapse=mineAnswered&&previous==='unanswered'/);
 assert.match(js,/if\(!mineAnswered\|\|shouldCollapse\)/);
 assert.match(js,/dailyQuestionAnswerState=mineAnswered\?'answered':'unanswered'/);
 assert.match(js,/block-collapse-button'\)\?\.setAttribute\('aria-expanded'/);
});
test('category total month caption tracks selection and search',()=>{
 assert.match(js,/financeCategoryHistoryRange\?'За выбранные даты':'За '\+financeMonthShortName\(month\)/);
 assert.match(js,/function financeMonthShortName\(month\)/);
});
test('motion is scoped and respects reduced-motion settings',()=>{
 assert.match(css,/RUDI v4\.149: consistent motion/);
 assert.match(css,/@media\(prefers-reduced-motion:reduce\)/);
 assert.match(css,/#calendarSearchPanel:not\(\[hidden\]\)/);
 assert.match(css,/#scoreModal \.score-panel:not\(\[hidden\]\)/);
 assert.match(js,/__rudiMotion149/);
 assert.doesNotMatch(cssAdditionOnly(),/calendarScopeSwitch|calendar-scope-switch/);
 function cssAdditionOnly(){return css.slice(css.indexOf('RUDI v4.149: consistent motion'))}
});
test('release marker and app scripts are consistent',()=>{
 assert.match(html,/\/app\.js\?v=4\.149/);
 assert.match(html,/\/app\.css\?v=4\.149/);
 assert.equal(fs.readFileSync('VERSION','utf8').trim(),'v4.149');
});

test('Face ID can be enabled and revoked on iPhone without removing PIN',()=>{
 const authDb=fs.readFileSync('api/rudi-auth-db.cjs','utf8');
 const server=fs.readFileSync('api/partner-message.js','utf8');
 assert.match(js,/settingsFaceIdConnect/);
 assert.match(js,/await passkeyRequest\('disable'\)/);
 assert.match(js,/\/iPhone\/i\.test\(navigator\.userAgent/);
 assert.match(server,/operation === 'disable'/);
 assert.match(server,/passkeysRevokedAt/);
 assert.match(authDb,/async function revokePasskeys/);
});
test('notifications are marked read when panel opens',()=>{
 assert.match(js,/markActivityItemsRead\(activityNotificationItems\(\),\{render:false\}\)/);
});
test('settings hide text size and PWA only in a regular browser',()=>{
 assert.match(js,/const browser=!isStandalonePwa\(\)&&!telegramInitData\(\)/);
});
