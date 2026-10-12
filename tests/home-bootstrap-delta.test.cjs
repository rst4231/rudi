const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {homeSectionHashes,buildHomeDelta}=require('../api/home-bootstrap-delta.cjs');
test('home bootstrap full load includes section hashes',()=>{
  const home={mood:{mood:'joy'},counts:{products:2}};
  const result=buildHomeDelta(home,null);
  assert.equal(result.homePartial,false);
  assert.deepEqual(result.home,home);
  assert.deepEqual(result.homeHashes,homeSectionHashes(home));
});
test('home bootstrap only sends changed sections and removed keys',()=>{
  const home={mood:{mood:'joy'},counts:{products:3}};
  const old={mood:{mood:'joy'},counts:{products:2},partnerHabits:{done:1}};
  const result=buildHomeDelta(home,homeSectionHashes(old));
  assert.equal(result.homePartial,true);
  assert.deepEqual(result.home,{counts:{products:3}});
  assert.deepEqual(result.homeRemoved,['partnerHabits']);
  const merged={...old,...result.home};
  for(const key of result.homeRemoved)delete merged[key];
  assert.deepEqual(merged,home);
  assert.deepEqual(buildHomeDelta(home,result.homeHashes).home,{});
});
test('home UI preserves unchanged cards and manual refresh',()=>{
  const source=fs.readFileSync(path.join(__dirname,'..','public','app.js'),'utf8');
  for(const field of ['activity','mood','cycle','dailyQuestion','partnerMessage','workDay','counts']){
    assert.ok(source.includes("homeBootstrapSectionChanged('"+field+"'"),field);
  }
  assert.match(source,/nearest\.dataset\.rudiRowsSignature!==nearestSignature/);
  assert.match(source,/today\.dataset\.rudiRowsSignature!==todaySignature/);
  assert.match(source,/loadHomeBootstrap\(\{force:true\}\)/);
  assert.match(source,/payload\.homePartial===true/);
});
