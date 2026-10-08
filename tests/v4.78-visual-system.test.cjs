const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const root=path.resolve(__dirname,'..');
const read=p=>fs.readFileSync(path.join(root,p),'utf8');
test('design stylesheet loaded after older styles, before JavaScript',()=>{
 const h=read('public/index.html');
 assert.ok(h.indexOf('/rudi-design-system.css?v=4.84')>h.indexOf('/supplement-advanced.css'));
 assert.ok(h.indexOf('/rudi-design-system.css?v=4.84')<h.indexOf('<script defer src="/app.js'));
 assert.match(h,/<meta name="rudi-version" content="v4.84">/);
});
test('build includes versioned design stylesheet',()=>{
 const b=read('build.cjs'),sw=read('public/sw.js');
 assert.ok(b.includes("'rudi-design-system.css'"));
 assert.ok(b.includes('rudi-design-system\\.css'));
 assert.ok(sw.includes('/rudi-design-system.css?v=4.84'));
});
test('visual scope covers cards, icons, charts, iOS forms and reduced motion',()=>{
 const s=read('public/rudi-design-system.css');
 for(const token of ['.profile','.panel','.app-tabbar','.work-page','.car-page',
 '.finance-coin-modal-sheet','.ticktick-task-modal-sheet','.personal-habits-progress-fill',
 '.finance-goal-progress','prefers-reduced-motion','safe-area-inset','focus-visible']) assert.ok(s.includes(token),token);
});
test('version metadata and VERSION agree',()=>{
 assert.equal(read('VERSION').trim(),'v4.84');
 assert.equal(JSON.parse(read('rudi-version.json')).current,'v4.84');
});

test('expense keypad sheet retains its v4.77 layout',()=>{
 const s=read('public/rudi-design-system.css');
 assert.ok(s.includes(':not(#financeExpenseComposer)'));
 assert.ok(!s.includes(' .finance-expense-entry-sheet{'));
 assert.ok(!s.includes('height:100dvh;'));
});
