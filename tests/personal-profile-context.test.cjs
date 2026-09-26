const test=require('node:test');const assert=require('node:assert/strict');const {profileContext}=require('../api/personal-profile-context.cjs');
test('personal profile context has current age and sex',()=>{assert.deepEqual(profileContext('Рустам'),{age:34,sex:'male',sexLabel:'Мужчина'});assert.deepEqual(profileContext('Диана'),{age:30,sex:'female',sexLabel:'Женщина'})});
