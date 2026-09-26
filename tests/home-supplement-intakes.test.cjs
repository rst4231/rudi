const test=require('node:test');const assert=require('node:assert/strict');const fs=require('node:fs');const path=require('node:path');

test('home expanded profiles show todays supplement intakes for both people',()=>{const source=fs.readFileSync(path.join(__dirname,'..','public','app.js'),'utf8');assert.match(source,/homeRustamSupplementIntakes/);assert.match(source,/homeDianaSupplementIntakes/);assert.match(source,/timeZone:'Europe\/Moscow'/);assert.match(source,/actor==='Диана'\?'💊 Сегодня приняла':'💊 Сегодня принял'/);assert.doesNotMatch(source,/maleFact\.id='malePsychologyFact'/)});

test('supplement overview API returns only todays own-list intakes for Rustam and Diana',()=>{const source=fs.readFileSync(path.join(__dirname,'..','api','supplements.js'),'utf8');assert.match(source,/operation==='overview'/);assert.match(source,/readSupplements\('Рустам'\)/);assert.match(source,/readSupplements\('Диана'\)/);assert.match(source,/intake\.date===today/);assert.match(source,/actors:\{'Рустам':buildRows\(rustamState\),'Диана':buildRows\(dianaState\)\}/)});

test('supplement intake journal uses supplement emoji including fish oil',()=>{const source=fs.readFileSync(path.join(__dirname,'..','public','app.js'),'utf8');assert.match(source,/if\(\/омега\|рыб\/\.test\(value\)\) return '🐟'/);assert.match(source,/if\(\/креатин\/\.test\(value\)\) return '🏋️'/);assert.match(source,/profile-supplement-intake-emoji/)});

test('taking supplement refreshes expanded profile journal immediately',()=>{const source=fs.readFileSync(path.join(__dirname,'..','public','supplement-advanced.js'),'utf8');assert.match(source,/rudi:supplement-intake-updated/);const app=fs.readFileSync(path.join(__dirname,'..','public','app.js'),'utf8');assert.match(app,/addEventListener\('rudi:supplement-intake-updated'/)});

test('fasting self label is first person with emoji',()=>{const source=fs.readFileSync(path.join(__dirname,'..','public','app.js'),'utf8');assert.match(source,/firstPerson\?'Голодаю':'Голодает'/);assert.match(source,/🍽️ /)});

test('final work calendar override forces gray work days and blue selected outline',()=>{const css=fs.readFileSync(path.join(__dirname,'..','public','app.css'),'utf8');assert.match(css,/Final calendar palette override/);assert.match(css,/\.work-page #workCalendarDays \.calendar-day-cell\.working/);assert.match(css,/\.work-page #workCalendarDays \.calendar-day-cell\.selected/);assert.match(css,/#6675ee!important/)});
