const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const read=p=>fs.readFileSync(path.join(__dirname,'..',p),'utf8');
test('SVG contour percent follows today supplement count, including 40%',()=>{
 const js=read('public/profile-supplements.js');
 assert.match(js,/function renderSupplementProfileOutline\(progress\)/);
 assert.match(js,/progress\.taken\/progress\.total\*100/);
 assert.match(js,/SUPPLEMENT_OUTLINE_LENGTH\*percent\/100/);
 assert.match(js,/svg\.hidden=progress\.total===0/);
 assert.match(js,/document\.createElementNS\(ns,'svg'\)/);
 assert.match(js,/renderSupplementProfileOutline\(progress\)/);
 assert.match(js,/button\.appendChild\(svg\)/);
 assert.match(js,/updateReminderBadges\(\)/);
});
test('iOS border stroke stays in bounds and does not swallow taps',()=>{
 const css=read('public/rudi-design-system.css');
 assert.match(css,/#supplementProfileButton::after\{\s*content:none!important/);
 assert.match(css,/#supplementProfileButton \.rudi-supplement-progress-outline\{/);
 assert.match(css,/pointer-events:none!important/);
 assert.match(css,/stroke-width:7/);
 assert.match(css,/stroke:#ffca65/);
});
test('PWA version invalidates stale asset cache on iPhone',()=>{
 const h=read('public/index.html'),sw=read('public/sw.js');
 assert.match(h,/name="rudi-version" content="v4\.82"/);
 assert.match(h,/profile-supplements\.js\?v=4\.82/);
 assert.match(h,/rudi-design-system\.css\?v=4\.82/);
 assert.match(sw,/rudi-shell-v4\.82/);
 assert.match(sw,/rudi-design-system\.css\?v=4\.82/);
 assert.equal(read('VERSION').trim(),'v4.82');
 assert.equal(JSON.parse(read('rudi-version.json')).current,'v4.82');
});
