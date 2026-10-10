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
 assert.match(js,/financeCategoryHistoryRange\?'За выбранные даты':'За '\+financeMonthGenitive\(month\)/);
 assert.match(js,/function financeMonthGenitive\(month\)/);
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
