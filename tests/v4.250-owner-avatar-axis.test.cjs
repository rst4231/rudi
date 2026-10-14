'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');

const src=fs.readFileSync('public/home-reference-layout.js','utf8');
const start=src.indexOf('function alignLiveProfileAxis(');
const end=src.indexOf('// Current-time biorhythm point',start);
assert.ok(start>=0&&end>start,'alignment function exists');
const alignSource=src.slice(start,end);

function getPositionedHead(actor,plotY){
  let frame=null,transform='',previousTransform='';
  const row={getBoundingClientRect:()=>({top:100,height:72})};
  const avatar={getBoundingClientRect:()=>({top:100,height:44})};
  const head={
    isConnected:true,
    querySelector:selector=>selector==='.score-avatar-wrap'?avatar:null,
    closest:selector=>selector==='.rudi-home-self-line'?row:null,
    style:{setProperty:(name,value)=>{if(name==='transform'){previousTransform=transform;transform=value;}}}
  };
  const energy={
    isConnected:true,
    querySelector:()=>({getBoundingClientRect:()=>({top:plotY,height:29})})
  };
  const sandbox={
    requestAnimationFrame:cb=>{frame=cb;return 1},
    cancelAnimationFrame:()=>{}
  };
  vm.runInNewContext('let axisFrame=0;\n'+alignSource+'\nthis.run=alignLiveProfileAxis;',sandbox);
  sandbox.run(head,energy);
  assert.equal(typeof frame,'function');
  frame();
  return {transform,previousTransform};
}

test('both account owners align the entire identity group to the row centre, independently of graph plot',()=>{
  for(const [actor,plotY] of [['Рустам',20],['Диана',250]]){
    const {transform,previousTransform}=getPositionedHead(actor,plotY);
    assert.equal(previousTransform,'none',actor+' clears previous displacement');
    assert.equal(transform,'translateY(14.00px)',actor+' moves photo/name/status together');
  }
});

test('owner layout uses its row as axis, never the upward-shifted plot',()=>{
  assert.match(alignSource,/closest\('\.rudi-home-self-line'\)/);
  assert.match(alignSource,/distance=\(r\.top\+r\.height\/2\)-\(a\.top\+a\.height\/2\)/);
  assert.doesNotMatch(alignSource,/plot\.getBoundingClientRect\(/);
});
