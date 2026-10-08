const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const css=fs.readFileSync('public/app.css','utf8');
const app=fs.readFileSync('public/app.js','utf8');
const html=fs.readFileSync('public/index.html','utf8');
const sw=fs.readFileSync('public/sw.js','utf8');
const release=css.slice(css.indexOf('/* RUDI v4.106 — aligned compact profile headers'));
test('energy phase is inline and no longer takes a second row',()=>{
  assert.match(release,/\.profile-person-card \.profile-energy-label\{[\s\S]*?display:flex!important/);
  assert.match(release,/\.profile-person-card \.profile-energy-phase:not\(:empty\)::before\{[\s\S]*?content:"·"/);
  assert.match(release,/grid-template-rows:24px 10px!important/);
  assert.match(app,/profile-energy-phase/);
});
test('energy curve remains legible but thinner and less glowy',()=>{
  assert.match(release,/profile-energy-glow\{stroke-width:4\.6!important;opacity:\.11!important/);
  assert.match(release,/profile-energy-path\{stroke-width:1\.9!important/);
  assert.match(release,/profile-energy-now\{[\s\S]*?width:8px!important/);
  assert.match(release,/profile-energy-times\{font-size:7px!important/);
});
test('both identity rows share a compact alignment, without shrinking avatars and buttons',()=>{
  assert.match(release,/profile-person-card \.profile-person-head\{[\s\S]*?min-height:62px!important/);
  assert.match(release,/profile-person-card \.profile-person-head > \.identity\{[\s\S]*?align-self:stretch!important/);
  assert.match(release,/profile-person-card \.profile-person-head \.identity \.person\{[\s\S]*?align-self:start!important/);
  assert.match(release,/profile-person-card \.profile-person-head > \.profile-person-actions\{[\s\S]*?align-self:center!important/);
  assert.match(release,/margin-top:5px!important/);
  assert.doesNotMatch(release,/(?:profile-contact-button|score-avatar-wrap)[^\n]*\{[\s\S]{0,100}?width:/);
});
test('fasting time labels are close under both tracker icons',()=>{
  assert.match(release,/#fastingProfileButton \.fasting-profile-elapsed,[\s\S]*?#partnerFastingProfileButton \.fasting-profile-elapsed\{[\s\S]*?top:calc\(100% \+ 1px\)!important/);
  assert.match(release,/font-size:9px!important/);
  assert.match(app,/partnerFastingElapsed/);
});
test('iPhone layout, actions, energy updates and version remain present',()=>{
  assert.match(release,/@media\(max-width:430px\)\{/);
  assert.match(release,/@media\(max-width:360px\)\{/);
  assert.match(app,/renderProfileEnergy\('Рустам',now\)/);
  assert.match(app,/renderProfileEnergy\('Диана',now\)/);
  assert.match(app,/actions\.append\(partnerFastingButton,makeProfileContactButton\('telegram',actor\),makeProfileContactButton\('phone',actor\)\)/);
  assert.match(html,/name="rudi-version" content="v4\.106"/);
  assert.match(sw,/rudi-shell-v4\.106/);
});
