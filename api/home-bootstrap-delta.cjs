const crypto=require('node:crypto');
function homeSectionHashes(home){
  const hashes={};
  if(!home||typeof home!=='object'||Array.isArray(home))return hashes;
  for(const [key,value] of Object.entries(home)){
    hashes[key]=crypto.createHash('sha256').update(JSON.stringify(value??null)).digest('hex').slice(0,24);
  }
  return hashes;
}
function buildHomeDelta(home,knownHashes){
  const homeHashes=homeSectionHashes(home);
  if(!knownHashes||typeof knownHashes!=='object'||Array.isArray(knownHashes)){
    return {home,homeHashes,homePartial:false};
  }
  const changed={};
  for(const [key,value] of Object.entries(home||{})){
    if(homeHashes[key]!==knownHashes[key])changed[key]=value;
  }
  const homeRemoved=Object.keys(knownHashes).filter(key=>!Object.prototype.hasOwnProperty.call(home||{},key));
  return {home:changed,homeHashes,homePartial:true,homeRemoved};
}
module.exports={homeSectionHashes,buildHomeDelta};
