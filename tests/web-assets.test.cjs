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

test('built core assets use stable public paths with release version queries',()=>{
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'rudi-assets-'));
  try{
    for(const file of ['build.cjs','runtime','config','rudi-version.json','public']) fs.cpSync(file,path.join(dir,file),{recursive:true});
    const build=()=>{
      const result=spawnSync(process.execPath,['build.cjs'],{cwd:dir,encoding:'utf8'});
      assert.equal(result.status,0,result.stderr);
      return fs.readFileSync(path.join(dir,'public/index.html'),'utf8');
    };
    const config=JSON.parse(fs.readFileSync(path.join(dir,'rudi-version.json'),'utf8'));
    const version=config.current.replace(/^v/,'');
    const first=build();
    assert.match(first,new RegExp('src="/app\\\\.js\\\\?v='+version.replace(/\\./g,'\\\\.')+'"'));
    assert.match(first,new RegExp('href="/app\\\\.css\\\\?v='+version.replace(/\\./g,'\\\\.')+'"'));
    assert.doesNotMatch(first,/\/assets\/app\.[a-f0-9]{12}\.(?:js|css)/);
    const firstSw=fs.readFileSync(path.join(dir,'public/sw.js'),'utf8');
    assert.ok(firstSw.includes("const CACHE_NAME='rudi-shell-"+config.current+"';"));
    assert.ok(firstSw.includes('NAVIGATION_TIMEOUT_MS=3500'),'service worker must bound stalled navigation requests');
    assert.equal(build(),first,'build must be idempotent');
  }finally{fs.rmSync(dir,{recursive:true,force:true})}
});

test('connectivity warning clears after confirmed API recovery',()=>{
  const pwa=fs.readFileSync('public/pwa-extras.js','utf8');
  assert.match(pwa,/function isRudiApiRequest\(input\)/);
  assert.match(pwa,/dispatchEvent\(new CustomEvent\('rudi-online-request-success'\)\)/);
  assert.match(pwa,/let recoverySuccesses=0/);
  assert.match(pwa,/if\(recoverySuccesses<2\) return/);
  assert.match(pwa,/banner\.hidden=true;[\s\S]*?classList\.remove\('rudi-offline'\)/);
});


test('read-only sections use a fast local snapshot while the live API refresh continues',()=>{
  const pwa=fs.readFileSync('public/pwa-extras.js','utf8');
  for(const route of ['/api/feed','/api/shared-album','/api/ticktick/today','/api/ticktick/calendar','/api/work-calendar']){
    assert.ok(pwa.includes("'" + route + "'"),'missing snapshot route '+route);
  }
  assert.match(pwa,/const RUDI_SNAPSHOT_FAST_FALLBACK_MS=450/);
  assert.match(pwa,/async function snapshotAwareFetch\(input,init,snapshotKey\)/);
  assert.match(pwa,/Promise\.race\(\[network,cacheCandidate\]\)/);
  assert.match(pwa,/if\(winner\.kind==='cache'\)[\s\S]*?network\.then\(result=>/);
  assert.match(pwa,/if\(snapshotKey&&navigator\.onLine!==false\)\{\s*return snapshotAwareFetch\(input,init,snapshotKey\)/);
  assert.match(pwa,/'ui-preferences'/);
});


test('activity joins resilient read snapshots and mutation routes stay out',()=>{
  const pwa=fs.readFileSync('public/pwa-extras.js','utf8');
  assert.match(pwa,/RUDI_SNAPSHOT_READ_ACTIONS=new Set\(\[[\s\S]*?'activity'[\s\S]*?'ui-preferences'/);
  assert.match(pwa,/RUDI_SNAPSHOT_FAST_FALLBACK_MS=450/);
  for(const route of ['/api/feed','/api/shared-album','/api/ticktick/today','/api/ticktick/calendar','/api/work-calendar']){
    assert.ok(pwa.includes("'"+route+"'"),'missing resilient read route '+route);
  }
  assert.doesNotMatch(pwa,/RUDI_SNAPSHOT_POST_READ_PATHS=new Set\(\[[\s\S]*?checklist-toggle/);
  assert.doesNotMatch(pwa,/RUDI_SNAPSHOT_POST_READ_PATHS=new Set\(\[[\s\S]*?task-complete/);
});


test('service worker never serves app shell assets from an obsolete shell cache',()=>{
  const sw=fs.readFileSync('public/sw.js','utf8');
  assert.doesNotMatch(sw,/shellCacheVersion|compareShellCaches/);
  assert.match(sw,/key\.startsWith\(SHELL_CACHE_PREFIX\)&&key!==CACHE_NAME/);
  assert.match(sw,/const cache=await caches\.open\(CACHE_NAME\);[\s\S]*?const cached=await cache\.match\(request\)/);
  assert.doesNotMatch(sw,/caches\.match\(request\)/);
});

test('PWA throttles service worker checks when iOS restores the standalone app',()=>{
  const pwa=fs.readFileSync('public/pwa-extras.js','utf8');
  assert.match(pwa,/UPDATE_CHECK_INTERVAL_MS=10\*60\*1000/);
  assert.match(pwa,/const checkForUpdate=\(force=false\)=>/);
  assert.match(pwa,/now-lastUpdateCheckAt\(\)<UPDATE_CHECK_INTERVAL_MS/);
  assert.match(pwa,/window\.addEventListener\('online',\(\)=>checkForUpdate\(true\)\)/);
  assert.match(pwa,/window\.addEventListener\('focus',\(\)=>checkForUpdate\(\)\)/);
  assert.match(pwa,/window\.addEventListener\('pageshow',\(\)=>checkForUpdate\(\)\)/);
  assert.match(pwa,/visibilitychange[\s\S]*?checkForUpdate\(\)/);
});
