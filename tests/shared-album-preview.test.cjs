const test=require('node:test');
const assert=require('node:assert/strict');
const {PREVIEW_MAX_EDGE,VIEWER_MAX_EDGE,pickDerivativeForMax}=require('../api/shared-album.cjs');

test('shared album preview selector keeps grid images compact',()=>{
  const photo={derivatives:{
    tiny:{checksum:'tiny',width:320,height:240,fileSize:20000},
    preview:{checksum:'preview',width:640,height:480,fileSize:60000},
    large:{checksum:'large',width:1600,height:1200,fileSize:400000},
    original:{checksum:'original',width:4032,height:3024,fileSize:3500000}
  }};
  assert.equal(PREVIEW_MAX_EDGE,640);
  assert.equal(VIEWER_MAX_EDGE,1800);
  assert.equal(pickDerivativeForMax(photo,PREVIEW_MAX_EDGE).checksum,'preview');
  assert.equal(pickDerivativeForMax(photo,VIEWER_MAX_EDGE).checksum,'large');
});
