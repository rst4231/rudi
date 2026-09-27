const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const root=path.join(__dirname,'..');
const html=fs.readFileSync(path.join(root,'public','index.html'),'utf8');
const app=fs.readFileSync(path.join(root,'public','app.js'),'utf8');
const css=fs.readFileSync(path.join(root,'public','app.css'),'utf8');
const extras=fs.readFileSync(path.join(root,'public','pwa-extras.css'),'utf8');
const sw=fs.readFileSync(path.join(root,'public','sw.js'),'utf8');
const partner=fs.readFileSync(path.join(root,'api','partner-message.js'),'utf8');
const store=fs.readFileSync(path.join(root,'api','feed-store.cjs'),'utf8');

test('Dates choices are always visible',()=>{
  assert.doesNotMatch(html,/id="dateIdeaButton"/);
  assert.match(html,/id="dateTimeChoices" class="date-time-choices" aria-label="Выберите время свидания"/);
  assert.match(html,/data-date-period="morning"/);
  assert.match(html,/data-date-period="day"/);
  assert.match(html,/data-date-period="evening"/);
  assert.match(app,/choices\.hidden=false/);
});

test('Fasting tracker shares Quick Access row with For Di',()=>{
  const start=css.indexOf('.quick-access-button.is-fasting');
  assert.ok(start>=0);
  assert.doesNotMatch(css.slice(start,start+240),/grid-column\s*:/);
  assert.match(css,/\.quick-access-actions\{display:grid;grid-template-columns:repeat\(2,minmax\(0,1fr\)\);gap:9px\}/);
});

test('Saved recipes use Kitchen recipe-card visual language',()=>{
  assert.match(extras,/\.products-section \.kitchen-saved-recipes/);
  assert.match(extras,/rgba\(240,163,74,\.13\)/);
  assert.match(extras,/border-radius:18px/);
  assert.match(html,/Сохраненные рецепты/);
});

test('Feed likes belong to individual cards instead of whole sections',()=>{
  assert.doesNotMatch(html,/id="feedConcertsLike"/);
  assert.doesNotMatch(html,/id="feedStandupLike"/);
  assert.doesNotMatch(html,/id="feedCinemaLike"/);
  assert.match(app,/function feedItemReactionTarget/);
  assert.match(app,/createFeedItemReaction\(target,item\.title\|\|'событие'\)/);
  assert.match(app,/createFeedItemReaction\(target,item\?\.title\|\|'фильм'\)/);
  assert.match(app,/slice\(index,index\+12\)/);
  assert.match(partner,/item:concerts:/);
  assert.match(partner,/item:standup:/);
  assert.match(partner,/item:cinema:/);
});

test('Service worker keeps previous shell as asset fallback',()=>{
  assert.match(sw,/const SHELL_CACHE_KEEP=2;/);
  assert.match(sw,/shellKeys\.slice\(0,SHELL_CACHE_KEEP\)/);
  assert.match(sw,/\(await cache\.match\(request\)\) \|\| \(await caches\.match\(request\)\)/);
});

test('Cinema selection cannot be erased by an empty intermediate update',()=>{
  assert.match(store,/name === 'cinema' && sections\.cinema/);
  assert.match(store,/sections\[name\] = next/);
});
