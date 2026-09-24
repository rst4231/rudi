const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const {resolveVersionLabel,syncWebVersion}=require('../build.cjs');

test('release config drives the UI version and source asset URLs',()=>{
  const config=JSON.parse(fs.readFileSync('rudi-version.json','utf8'));
  assert.match(config.current,/^v\d+\.\d+\.\d+$/);
  syncWebVersion();
  const html=fs.readFileSync('public/index.html','utf8');
  const version=config.current.slice(1).replace(/\./g,'\\.');
  for(const name of ['app.css','calendar.css','smart-home.css','car.css','app.js','smart-home.js','car.js']){
    const [stem,ext]=name.split('.');
    assert.match(html,new RegExp('/'+stem+'\\.'+ext+'\\?v='+version+'|/assets/'+stem+'\\.[a-f0-9]{12}\\.'+ext));
  }
  assert.ok(html.includes('<meta name="rudi-version" content="'+config.current+'">'));
});


test('deploy commit version overrides stale config',()=>{
  assert.equal(
    resolveVersionLabel({VERCEL_GIT_COMMIT_MESSAGE:'deploy: publish RUDI v9.8.7'},{current:'v1.0.0'}),
    'v9.8.7'
  );
});

test('service worker cache follows resolved RUDI version',()=>{
  const config=JSON.parse(fs.readFileSync('rudi-version.json','utf8'));
  syncWebVersion({});
  const sw=fs.readFileSync('public/sw.js','utf8');
  assert.ok(sw.includes("const CACHE_NAME='rudi-shell-"+config.current+"';"));
  assert.equal(fs.readFileSync('VERSION','utf8').trim(),config.current);
});
