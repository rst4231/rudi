const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const {normalizeUiPreferencesState}=require('../api/ui-preferences-store.cjs');

test('humidity alert preference defaults on and can be disabled',()=>{
  assert.equal(normalizeUiPreferencesState({}).humidityAlertEnabled,true);
  assert.equal(normalizeUiPreferencesState({humidityAlertEnabled:false}).humidityAlertEnabled,false);
});

test('settings expose low humidity toggle and hourly cron',()=>{
  const app=fs.readFileSync('public/app.js','utf8');
  const config=JSON.parse(fs.readFileSync('vercel.json','utf8'));
  assert.match(app,/id="settingsHumidityAlertToggle"/);
  assert.match(app,/function humidityAlertEnabled\(\)/);
  assert.match(app,/humidityAlertEnabled:next,syncSchemaVersion:4/);
  assert.ok(config.crons.some(row=>row.path==='/api/smart-home-humidity-cron'&&row.schedule==='0 * * * *'));
});
