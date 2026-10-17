const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs');
test('shell requests exactly the script/style URLs present in the new offline cache',()=>{
 const html=fs.readFileSync('public/index.html','utf8'),sw=fs.readFileSync('public/sw.js','utf8');
 const precache=JSON.parse(sw.match(/const PRECACHE=(\[[\s\S]*?\]);/)[1]);
 const byPath=new Map(precache.filter(x=>/\.(css|js)\?/.test(x)).map(x=>[x.split('?')[0],x]));
 const references=[...html.matchAll(/(?:src|href)="(\/[^" ]+\.(?:css|js)\?[^" ]+)"/g)].map(x=>x[1]);
 let checked=0;
 for(const url of references){const cached=byPath.get(url.split('?')[0]);if(!cached)continue;assert.equal(url,cached,'Exact offline cache match: '+url.split('?')[0]);checked++;}
 assert.ok(checked>30,'Verify the real shell, not an empty subset');
 assert.ok(precache.includes('/battle-ocean.svg'),'Ocean artwork stays available offline');
});
test('version replacement preserves executable inline loaders',()=>{
 const vm=require('node:vm'),html=fs.readFileSync('public/index.html','utf8');
 for(const match of html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/g)){
  if(!match[1].trim())continue;
  assert.doesNotThrow(()=>new vm.Script(match[1]),'Inline script at HTML line '+(html.slice(0,match.index).split('\n').length));
 }
});
