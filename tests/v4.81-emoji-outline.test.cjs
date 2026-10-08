const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const read=p=>fs.readFileSync(path.join(__dirname,'..',p),'utf8');
test('neon outline follows the four emoji buttons only',()=>{
 const css=read('public/rudi-design-system.css');
 for(const id of ['fastingProfileButton','habitProfileButton','financeProfileButton','supplementProfileButton']){
   assert.ok(css.includes('#'+id),'Missing '+id);
 }
 assert.match(css,/\.profile \.profile-mood \.mood-self-buttons/);
 assert.match(css,/inset:0;/);
 assert.match(css,/border-radius:inherit;/);
 assert.match(css,/mask-composite:exclude;/);
 assert.match(css,/-webkit-mask-composite:xor;/);
 assert.match(css,/pointer-events:none;/);
 assert.match(css,/prefers-reduced-motion:reduce/);
 assert.doesNotMatch(css,/text-shadow:[^;]*rudiEmojiOutlineOrbit/);
});
test('visual update cache and version labels',()=>{
 const html=read('public/index.html');
 const sw=read('public/sw.js');
 assert.match(html,/name="rudi-version" content="v4\.83"/);
 assert.match(html,/rudi-design-system\.css\?v=4\.83/);
 assert.match(sw,/rudi-shell-v4\.83/);
 assert.match(sw,/rudi-design-system\.css\?v=4\.83/);
 assert.equal(read('VERSION').trim(),'v4.83');
 assert.equal(JSON.parse(read('rudi-version.json')).current,'v4.83');
});
