const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');

const CURRENT_RELEASE = require('node:fs').readFileSync(require('node:path').join(__dirname,'..','VERSION'),'utf8').trim();

test('v4.77 daily finance totals use actual expenses only',()=>{
  const app=fs.readFileSync(path.join(__dirname,'..','public','app.js'),'utf8');
  const version=JSON.parse(fs.readFileSync(path.join(__dirname,'..','rudi-version.json'),'utf8'));
  assert.ok(app.includes(".filter(row=>!row?.manualAdjustment&&financeDateTimeLabel(row.occurredAt||row.createdAt).key===dateKey)"));
  assert.ok(app.includes("financeOverviewMoney(dailySpent(yesterdayKey))"));
  assert.ok(app.includes("financeOverviewMoney(dailySpent(todayKey))"));
  assert.ok(!app.includes("dailySpent(todayKey,{excludeAdjustments:true})"));
  assert.equal(version.current,CURRENT_RELEASE);
});
