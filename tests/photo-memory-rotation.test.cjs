'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const app=fs.readFileSync('public/app.js','utf8');
const start=app.indexOf('function sharedAlbumPhotoTime(photo){');
const end=app.indexOf('function sharedAlbumPeriodWord(',start);
function selector(){
 let now=Date.parse('2026-10-23T09:00:00Z');
 const NativeDate=Date;
 class ClockDate extends NativeDate{constructor(...args){super(...(args.length?args:[now]));}static now(){return now;}}
 const pick=vm.runInNewContext(app.slice(start,end)+';sharedAlbumMemoryPhoto',{Date:ClockDate,Intl,DAY:86400000,TZ:'Europe/Moscow'});
 return {pick,setTime:at=>now=Date.parse(at),day:offset=>now=Date.parse('2026-10-23T09:00:00Z')+offset*86400000};
}
const photos=(count=12)=>Array.from({length:count},(_,i)=>({id:'photo-'+i,type:'image',date:'2025-01-01T12:00:00Z',url:'https://cdn.example.test/'+i+'.jpg'}));
test('daily memories visit every eligible photo before repeating within a stable album',()=>{
 const s=selector(),pool=photos();const ids=[];
 for(let i=0;i<pool.length;i++){s.day(i);ids.push(s.pick(pool).id);}
 assert.equal(new Set(ids).size,pool.length,'every eligible memory must get a turn before repeats');
 s.day(pool.length);assert.equal(s.pick(pool).id,ids[0]);
});
test('the memory remains stable all Moscow day regardless of source ordering and signed URL refresh',()=>{
 const s=selector(),pool=photos();s.setTime('2026-10-22T21:01:00Z');const first=s.pick(pool).id;
 s.setTime('2026-10-23T20:59:00Z');
 assert.equal(s.pick(pool.slice().reverse().map(p=>({...p,url:p.url+'?signed=changed'}))).id,first);
 s.setTime('2026-10-23T21:01:00Z');assert.notEqual(s.pick(pool).id,first);
});
test('duplicate records for one photo do not take extra turns in the rotation',()=>{
 const s=selector(),pool=photos(3),withDuplicates=[pool[0],pool[0],pool[1],pool[2],{...pool[1]}];
 const chosen=[];for(let i=0;i<3;i++){s.day(i);chosen.push(s.pick(withDuplicates).id);assert.equal(s.pick(withDuplicates).id,s.pick(pool).id);}
 assert.equal(new Set(chosen).size,3);
});
test('videos, recent photos, invalid dates and undated media are never daily memories',()=>{
 const s=selector(),pool=photos(2),bad=[{...pool[0],id:'video',type:'video'},{...pool[0],id:'recent',date:'2026-10-22T12:00:00Z'},{...pool[0],id:'invalid',date:'bad'},{...pool[0],id:'undated',date:''}];
 for(let i=0;i<2;i++){s.day(i);assert.ok(pool.some(p=>p.id===s.pick([...bad,...pool]).id));}
 assert.equal(s.pick(bad),null);assert.equal(s.pick([]),null);
});
test('a single eligible photo remains available and the source array is not reordered',()=>{
 const s=selector(),pool=photos(1),original=JSON.stringify(pool);
 for(let i=0;i<4;i++){s.day(i);assert.equal(s.pick(pool),pool[0]);}
 assert.equal(JSON.stringify(pool),original);
});
