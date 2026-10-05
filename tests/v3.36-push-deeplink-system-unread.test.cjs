const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');

test('all home-targeted push notifications use explicit home tab deep links',()=>{
  const partner=fs.readFileSync('api/partner-message.js','utf8');
  const lulu=fs.readFileSync('api/lulu-toilet-alert.cjs','utf8');
  const humidity=fs.readFileSync('api/smart-home-humidity-alert.cjs','utf8');

  assert.match(partner,/url: '\/\?tab=home&item=partner&fresh=1'/);
  assert.match(partner,/url: '\/\?tab=home&item=lulu'/);
  assert.match(partner,/url:'\/\?tab=home&item=daily-question'/);
  assert.match(partner,/url:'\/\?tab=home&item=priority'/);
  assert.match(partner,/url: '\/\?tab=home&item=' \+ item/);
  assert.match(lulu,/url: '\/\?tab=home&item=lulu'/);
  assert.match(humidity,/url:'\/\?tab=home&item=smart-home'/);

  assert.doesNotMatch(partner,/url:\s*['"]\/\?item=/);
  assert.doesNotMatch(lulu,/url:\s*['"]\/\?item=/);
  assert.doesNotMatch(humidity,/url:\s*['"]\/\?item=/);
});

