'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const file=path=>fs.readFileSync(path,'utf8');

test('main shell edge swipe yields to meditation, games, mood history and AI center',()=>{
 const source=file('public/app.js');
 for(const cls of ['rudi-center-open','rudi-games-open','meditation-page-open','mood-history-open','score-modal-open'])
  assert.ok(source.includes("document.body.classList.contains('"+cls+"')"),cls);
 assert.match(source,/function installAppEdgeSwipeBack\(/);
});
test('games preserves close/open state and animates without delaying activity shutdown',()=>{
 const js=file('public/rudi-games.js');
 const css=file('public/rudi-games.css');
 assert.match(js,/clearTimeout\(pageCloseTimer\);page\.classList\.remove\('is-closing'\)/);
 assert.match(js,/pageCloseTimer=setTimeout\(finish,210\)/);
 assert.match(js,/stopDuel\(\);window\.RudiGameExtras\?\.stop\?\.\(\)/);
 assert.match(css,/\.rudi-games-page\.is-closing:not\(\[hidden\]\)/);
 assert.match(css,/prefers-reduced-motion:reduce/);
});
test('meditation closes smoothly while audio/wakelock shutdown is immediate',()=>{
 const js=file('public/meditation.js');
 const css=file('public/meditation.css');
 assert.match(js,/meditationCloseTimer=setTimeout\(finish,210\)/);
 assert.match(js,/RudiMeditationAudio\?\.onClose\(\)/);
 assert.match(css,/\.rudi-meditation-page\.is-closing:not\(\[hidden\]\)/);
 assert.match(css,/prefers-reduced-motion:reduce/);
});
test('mood history uses interruptible forward/reverse animations',()=>{
 const js=file('public/mood-history.js');
 const css=file('public/app.css');
 assert.match(js,/moodCloseTimer=setTimeout\(finish,210\)/);
 assert.match(js,/clearTimeout\(moodCloseTimer\)/);
 assert.match(css,/\.mood-history-page\.is-closing:not\(\[hidden\]\)/);
 assert.match(css,/prefers-reduced-motion:reduce/);
});
