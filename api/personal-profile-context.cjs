const PROFILES=Object.freeze({
  'Рустам':Object.freeze({age:34,sex:'male',sexLabel:'Мужчина'}),
  'Диана':Object.freeze({age:30,sex:'female',sexLabel:'Женщина'}),
});
function profileContext(actor){
  const profile=PROFILES[String(actor||'').trim()];
  if(!profile)throw new Error('profile-context-invalid');
  return profile;
}
module.exports={PROFILES,profileContext};