const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const {spawnSync}=require('node:child_process');

test('PWA snapshots fall back on a stalled or aborted Vercel request, not only navigator offline',()=>{
  const pwa=fs.readFileSync('public/pwa-extras.js','utf8');
  const start=pwa.indexOf('window.fetch=async');
  const end=pwa.indexOf('window.addEventListener(\'online\'',start);
  assert.ok(start>=0&&end>start);
  const block=pwa.slice(start,end);
  assert.match(block,/String\(error\?\.name\|\|''\)==='AbortError'/);
  assert.match(block,/if\(snapshotKey&&networkFailure\)/);
  assert.doesNotMatch(block,/if\(snapshotKey&&!aborted&&networkFailure\)/);
});

test('built assets have stable content URLs, and editing one invalidates only that file',()=>{
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'rudi-assets-'));
  try{
    for(const file of ['build.cjs','runtime','config','rudi-version.json','public']) fs.cpSync(file,path.join(dir,file),{recursive:true});
    const build=()=>{
      const result=spawnSync(process.execPath,['build.cjs'],{cwd:dir,encoding:'utf8'});
      assert.equal(result.status,0,result.stderr);
      return fs.readFileSync(path.join(dir,'public/index.html'),'utf8');
    };
    const first=build();
    const js=first.match(/src="(\/assets\/app\.[a-f0-9]{12}\.js)"/);
    assert.ok(js,'app must use a content-addressed URL');
    const css=first.match(/href="(\/assets\/app\.[a-f0-9]{12}\.css)"/);
    assert.ok(css);
    const firstSw=fs.readFileSync(path.join(dir,'public/sw.js'),'utf8');
    assert.ok(firstSw.includes(js[1]),'service worker must precache the current app script');
    assert.ok(firstSw.includes(css[1]),'service worker must precache the current app stylesheet');
    assert.ok(firstSw.includes('NAVIGATION_TIMEOUT_MS=3500'),'service worker must bound stalled navigation requests');
    for(const [,url] of first.matchAll(/(?:src|href)="(\/assets\/[^"?]+)"/g)){
      assert.ok(fs.statSync(path.join(dir,'public',url)).size>0,'missing '+url);
    }
    assert.equal(build(),first,'build must be idempotent');
    fs.appendFileSync(path.join(dir,'public/app.js'),'\n// changed asset\n');
    const second=build();
    assert.ok(!second.includes(js[1]),'changed script must get a new URL');
    assert.ok(second.includes(css[1]),'unchanged styles must keep their URL');
    const secondJs=second.match(/src="(\/assets\/app\.[a-f0-9]{12}\.js)"/);
    const secondSw=fs.readFileSync(path.join(dir,'public/sw.js'),'utf8');
    assert.ok(secondJs);
    assert.ok(secondSw.includes(secondJs[1]),'service worker must follow the new app script hash');
    assert.ok(!secondSw.includes(js[1]),'service worker must not pin the obsolete app script hash');
  }finally{fs.rmSync(dir,{recursive:true,force:true})}
});
