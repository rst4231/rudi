const test=require('node:test');
const assert=require('node:assert/strict');
const {pickDerivative}=require('../api/shared-album.cjs');

test('shared album grid prefers the largest derivative no bigger than 640px',()=>{
  const photo={derivatives:{
    tiny:{checksum:'tiny',width:320,height:240,fileSize:20000},
    preview:{checksum:'preview',width:640,height:480,fileSize:60000},
    large:{checksum:'large',width:1600,height:1200,fileSize:400000},
    original:{checksum:'original',width:4032,height:3024,fileSize:3500000}
  }};
  assert.equal(pickDerivative(photo).checksum,'preview');
});

test('shared album grid falls back to the smallest derivative when no compact preview exists',()=>{
  const photo={derivatives:{
    medium:{checksum:'medium',width:1024,height:768,fileSize:180000},
    large:{checksum:'large',width:2048,height:1536,fileSize:900000}
  }};
  assert.equal(pickDerivative(photo).checksum,'medium');
});
