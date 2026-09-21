const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');

const access=require('../api/rudi-access.cjs');
const partner=require('../api/partner-message.js');

test('signed Telegram profile name corrects stale role labels for allowed accounts',()=>{
  assert.equal(access.allowedActor({id:901637773,first_name:'RUSTA'}),'Рустам');
  assert.equal(access.allowedActor({id:941263519,first_name:'RUSTA'}),'Рустам');
  assert.equal(access.allowedActor({id:901637773,first_name:'Диана'}),'Диана');
  assert.equal(access.allowedActor({id:941263519,first_name:'Diana'}),'Диана');
});

test('unknown Telegram ids remain denied even with a matching name',()=>{
  assert.equal(access.allowedActor({id:123456789,first_name:'RUSTA'}),'');
});

test('recipient pair is corrected from the current signed session',()=>{
  assert.deepEqual(
    partner.correctRecipientsForSession({'Рустам':901637773,'Диана':941263519},'Рустам',941263519),
    {'Рустам':941263519,'Диана':901637773}
  );
  assert.deepEqual(
    partner.correctRecipientsForSession({'Рустам':901637773,'Диана':941263519},'Рустам',901637773),
    {'Рустам':901637773,'Диана':941263519}
  );
});

test('cycle bootstrap is tolerant of Runtime Cache confirmation failures',()=>{
  const source=fs.readFileSync('api/partner-message.js','utf8');
  assert.match(source,/cycleReady: Boolean\(stored\)/);
  assert.match(source,/confirmWrites: false/);
});

test('Telegram receives cache-busted v0.4.6 assets',()=>{
  const html=fs.readFileSync('public/index.html','utf8');
  assert.match(html,/\/app\.css\?v=0\.4\.6/);
  assert.match(html,/\/app\.js\?v=0\.4\.6/);
  assert.match(html,/>v0\.4\.6<\/div>/);
});
