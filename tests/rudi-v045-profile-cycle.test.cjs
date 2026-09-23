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

test('Telegram receives cache-busted current release assets',()=>{
  const html=fs.readFileSync('public/index.html','utf8');
  const label=JSON.parse(fs.readFileSync('rudi-version.json','utf8')).current;
  const asset=label.replace(/^v/,'').replace(/\./g,'\\.');
  const escapedLabel=label.replace(/\./g,'\\.');
  assert.match(html,new RegExp('/app\\.css\\?v='+asset+'|/assets/app\\.[a-f0-9]{12}\\.css'));
  assert.match(html,new RegExp('/app\\.js\\?v='+asset+'|/assets/app\\.[a-f0-9]{12}\\.js'));
  assert.ok(
    new RegExp('<meta name="rudi-version" content="'+escapedLabel+'"').test(html)
      || new RegExp('>'+escapedLabel+'<\\/div>').test(html)
  );
});


test('home cycle summary includes a daily recommendation and opens full cycle in Calendar',()=>{
  const app=fs.readFileSync('public/app.js','utf8');
  assert.match(app,/function dianaCycleDailyAdvice\(modelOrPhase\)/);
  assert.match(app,/homeCycleAdvice/);
  assert.match(app,/homeCycleOpen/);
  assert.match(app,/Показать полностью/);
  assert.match(app,/navigateToAppTab\('schedule',\{scroll:true\}\)/);
  assert.match(app,/dianaCycleCard.*scrollIntoView/s);
});
