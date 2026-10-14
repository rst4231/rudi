'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const html=fs.readFileSync('public/index.html','utf8');
const app=fs.readFileSync('public/app.js','utf8');
const design=fs.readFileSync('public/rudi-design-system.css','utf8');
const homeCss=fs.readFileSync('public/home-reference-layout.css','utf8');

test('partner fasting no longer takes a slot beside Telegram and phone',()=>{
 assert.doesNotMatch(html,/id="partnerFastingStatus"/);
 const part=app.slice(app.indexOf("const makePersonTile=(actor,identity)=>"),app.indexOf("const energy=document.createElement('div');",app.indexOf("const makePersonTile=(actor,identity)=>")));
 assert.ok(part.length>0);
 assert.doesNotMatch(part,/partnerFastingButton|partnerFastingProfileButton|partnerFastingElapsed/);
 assert.match(part,/actions\.append\(makeProfileContactButton\('telegram',actor\),makeProfileContactButton\('phone',actor\)\)/);
 assert.match(part,/avatarWrap\.append\(avatar\)/);
});

test('partner fasting is painted over the partner avatar using the former progress colors',()=>{
 assert.match(app,/function renderFastingProfileOutline\(active,partner=false\)/);
 assert.match(app,/renderFastingProfileOutline\(fastingOverviewState\[partnerActor\],true\)/);
 assert.match(app,/wrap\.classList\.toggle\('rudi-partner-fasting-active',activeNow\)/);
 assert.match(app,/hoursNode\.textContent=hours\+' ч'/);
 assert.match(app,/const color=reached\?'#38dc8f':'#a59af9'/);
 assert.match(app,/outline\.querySelector\('\.rudi-partner-fasting-value'\)\.style\.strokeDasharray=/);
 assert.match(homeCss,/\.rudi-partner-fasting-outline/);
 assert.match(homeCss,/\.rudi-partner-fasting-hours/);
 assert.match(design,/#partnerFastingProfileButton \.rudi-fasting-progress-value/);
});

test('partner elapsed time and halo disappear after ending without affecting own tracker',()=>{
 assert.match(app,/if\(!activeNow\)\{\s*if\(oldHours\)\{oldHours\.hidden=true;oldHours\.textContent=''\}/);
 assert.match(app,/if\(oldOutline\)oldOutline\.hidden=true/);
 assert.match(app,/const button=document\.getElementById\('fastingProfileButton'\)/);
 assert.match(app,/if\(!button\)return/);
});

test('partner mood popover displays mood name when no reason is set',()=>{
 assert.match(app,/const label=reasonLabel\|\|MOOD_META\[mood==='fear'\?'boredom':mood\]\?\.label\|\|''/);
 assert.match(app,/return label&&time\?label\+' · '\+time:\(label\|\|time\)/);
 assert.match(app,/const text=String\(holder\.dataset\.moodReasonText\|\|''\)\.trim\(\)/);
 assert.doesNotMatch(app,/reasonText\|\|'Причина не указана'/);
});
