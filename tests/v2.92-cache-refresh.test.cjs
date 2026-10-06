const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const read=p=>fs.readFileSync(path.join(__dirname,'..',p),'utf8');

test('current release refreshes changed core assets',()=>{
  const html=read('public/index.html');
  const config=JSON.parse(read('rudi-version.json'));
  const version=String(config.current||'').replace(/^v/,'').replace(/\./g,'\\.');
  const current=String(config.current||'').replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
  assert.match(html,new RegExp('rudi-version" content="'+current+'"'));
  assert.match(html,new RegExp('app\\.js\\?v='+version));
  assert.match(html,new RegExp('profile-supplements\\.js\\?v='+version));
  assert.match(html,new RegExp('mood-history\\.js\\?v='+version));
  assert.match(html,new RegExp('car\\.js\\?v='+version));
});
