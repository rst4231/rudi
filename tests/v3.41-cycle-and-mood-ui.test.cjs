const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');

const app=fs.readFileSync('public/app.js','utf8');
const appCss=fs.readFileSync('public/app.css','utf8');
const mood=fs.readFileSync('public/mood-history.js','utf8');
const moodCss=fs.readFileSync('public/mood-history-v2101.css','utf8');

test('joy and love are always positive when dominant for a mood factor',()=>{
  assert.match(mood,/const isPositive=topMood==='joy'\|\|topMood==='love'\|\|\(positive>negative&&positive>0\)/);
});

test('mood percentage cards fit one row on iPhone',()=>{
  assert.match(moodCss,/@media\(max-width:430px\)\{[\s\S]*?\.mood-stats\{display:grid;grid-template-columns:repeat\(4,minmax\(0,1fr\)\)/);
  assert.match(moodCss,/\.mood-factor-stats,\.mood-stat-summary\{grid-column:1\/-1\}/);
});

test('cycle brain and appetite guidance changes inside phases',()=>{
  assert.match(app,/первые 1–2 дня у части женщин/);
  assert.match(app,/середине фолликулярной фазы/);
  assert.match(app,/ориентировочный день овуляции/);
  assert.match(app,/за 1–2 дня до месячных/);
  assert.match(app,/ранней лютеиновой фазе/);
});

test('cycle brain and appetite cards use white text',()=>{
  assert.match(appCss,/\.cycle-insight-card span\{color:#fff/);
  assert.match(appCss,/\.cycle-insight-card strong\{color:#fff/);
});
