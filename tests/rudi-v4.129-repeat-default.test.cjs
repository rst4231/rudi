'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const app=fs.readFileSync('public/app.js','utf8');
const html=fs.readFileSync('public/index.html','utf8');
const api=fs.readFileSync('api/partner-message.js','utf8');

test('the repeat input defaults to 1 and accepts one additional repeat',()=>{
  assert.match(html,/id="ticktickTaskRepeatCountInput"[^>]*min="1"[^>]*value="1"/);
  assert.match(app,/repeatCountInput\.value=String\(editingTask\?\.repeatCount\|\|1\)/);
  assert.match(app,/repeatCount=repeating\?Math\.max\(1,Math\.min\(365,Math\.round\(Number\(repeatCountInput\?\.value\)\|\|1\)\)\):1/);
  assert.match(app,/repeatCount===Math\.max\(1,Math\.min\(365,Math\.round\(Number\(editingTask\.repeatCount\)\|\|1\)\)\)/);
});

test('RRULE COUNT includes the initial occurrence, so 1 repeat means COUNT=2',()=>{
  const start=api.indexOf('function tickTickRepeatFlag(value, count) {');
  const end=api.indexOf('function tickTickTaskDateTime(',start);
  assert.ok(start>=0&&end>start,'repeat converter exists');
  const declarations=api.slice(start,end);
  const context={};
  vm.runInNewContext(declarations,context);
  const repeat=vm.runInNewContext('tickTickRepeatFlag',context);
  const fromFlag=vm.runInNewContext('tickTickRepetitionsFromFlag',context);
  assert.equal(repeat('weekly',1),'RRULE:FREQ=WEEKLY;INTERVAL=1;COUNT=2');
  assert.equal(repeat('daily',2),'RRULE:FREQ=DAILY;INTERVAL=1;COUNT=3');
  assert.equal(repeat('none',1),'');
  assert.equal(fromFlag('RRULE:FREQ=WEEKLY;INTERVAL=1;COUNT=2'),1);
  assert.equal(fromFlag('RRULE:FREQ=DAILY;INTERVAL=1;COUNT=3'),2);
  assert.equal(fromFlag(''),1);
  assert.equal(fromFlag(repeat('monthly',1)),1);
});

test('server consistently returns repeat number as repetitions rather than total occurrences',()=>{
  assert.match(api,/repeatCount:repeatFlag\?Math\.max\(1,Math\.min\(365,Math\.round\(Number\(body\.repeatCount\)\|\|1\)\)\):1/);
  const uses=api.match(/tickTickRepetitionsFromFlag\((?:source\.repeatFlag|repeatFlag)\)/g)||[];
  assert.equal(uses.length,3,'today/search/calendar must all use repeat converter');
  const current=JSON.parse(fs.readFileSync('rudi-version.json','utf8')).current.slice(1).replace(/\./g,'\\.');
  assert.match(html,new RegExp('app\\.js\\?v='+current));
});
