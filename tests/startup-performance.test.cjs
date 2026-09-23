const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const source = fs.readFileSync('public/app.js', 'utf8');

function configHarness({cached, fetchImpl} = {}) {
  const storage = new Map(cached ? [['rudi-config-cache-v1', JSON.stringify(cached)]] : []);
  const context = vm.createContext({
    CONFIG_URL: 'https://example.test/config.json', fallback: {dailyIdeas:['Резервная идея'], weather:{enabled:false}},
    fetch: fetchImpl || (() => new Promise(() => {})), AbortController, setTimeout, clearTimeout,
    localStorage: {getItem: key => storage.get(key) || null, setItem: (key, value) => storage.set(key, value)},
  });
  const timers = source.slice(source.indexOf('      function withTimeout('), source.indexOf('      const managedRequestState'));
  const config = source.slice(source.indexOf('      async function loadConfig('), source.indexOf('      function parseCycleDate('));
  vm.runInContext(timers + config, context);
  return {load: () => vm.runInContext('loadConfig()', context), storage};
}

test('saved public settings are available even while the remote config is stalled', async () => {
  const harness = configHarness({cached:{savedAt:Date.now(),value:{dailyIdeas:['Сохранённая идея']}}});
  const result = await Promise.race([harness.load(), new Promise(resolve => setTimeout(() => resolve(null), 50))]);
  assert.ok(result, 'cached settings must not wait for the network');
  assert.equal(result.dailyIdeas[0], 'Сохранённая идея');
});

test('a failed config request preserves saved settings', async () => {
  const harness = configHarness({cached:{savedAt:0,value:{dailyIdeas:['Сохранённая идея']}},fetchImpl:async()=>{throw new Error('offline')}});
  const result = await harness.load();
  assert.equal(result.dailyIdeas[0], 'Сохранённая идея');
});

test('first launch has a bounded wait when settings never arrive', async () => {
  const harness = configHarness();
  const result = await Promise.race([harness.load(), new Promise(resolve => setTimeout(() => resolve(null), 1800))]);
  assert.ok(result, 'first launch must fall back within 1.8 seconds');
  assert.equal(result.dailyIdeas[0], 'Резервная идея');
});

test('settings request starts while authentication is still pending', async () => {
  let requested = false;
  const context = vm.createContext({authenticateApp:()=>new Promise(()=>{}),loadConfig:()=>{requested=true;return Promise.resolve({})}});
  vm.runInContext(source.slice(source.indexOf('      async function init(){'),source.indexOf('      init().catch('))+'\ninit();', context);
  await Promise.resolve();
  assert.equal(requested, true);
});

test('first pageshow does not repeat startup reads; bfcache return refreshes once', () => {
  let handler;
  let refreshes=0;
  const context=vm.createContext({window:{addEventListener:(name,fn)=>{handler=fn}},ensureAppSurface(){},refreshAfterResume(){refreshes++}});
  vm.runInContext(source.slice(source.indexOf("      window.addEventListener('pageshow'"),source.indexOf("      window.addEventListener('focus'")),context);
  handler({persisted:false});
  assert.equal(refreshes,0);
  handler({persisted:true});
  assert.equal(refreshes,1);
});
