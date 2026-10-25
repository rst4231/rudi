const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs');
const file=__dirname+'/../public/car-location-view.js';
test('last location view is available',()=>assert.ok(fs.existsSync(file)));
if(fs.existsSync(file)){
const {describeLocation}=require(file);
test('no coordinates are invented when the headunit has not sent GPS',()=>{assert.equal(describeLocation(null).available,false);assert.equal(describeLocation({latitude:null,longitude:0}).available,false)});
test('last location retains capture date and opens exact Yandex coordinates',()=>{const p={latitude:55.7522,longitude:37.6156,accuracy:18,capturedAt:'2026-10-20T12:30:00Z'};const x=describeLocation(p);assert.equal(x.available,true);assert.match(x.when,/20/);assert.match(x.when,/15:30/);assert.match(x.url,/37.6156.*55.7522/);assert.match(x.accuracy,/18/)});
test('invalid or infinite coordinates are rejected',()=>{for(const p of [{latitude:91,longitude:0},{latitude:1,longitude:Infinity},{latitude:0,longitude:-181}])assert.equal(describeLocation({...p,capturedAt:'2026-10-20T12:30:00Z'}).available,false)});
}
