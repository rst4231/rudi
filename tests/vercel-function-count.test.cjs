const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');

test('Hobby deployment stays within 12 Serverless Functions',()=>{
  const apiDir=path.join(__dirname,'..','api');
  const functions=fs.readdirSync(apiDir).filter(name=>name.endsWith('.js')).sort();
  assert.ok(functions.length<=12,'Serverless Functions: '+functions.length+'\n'+functions.join('\n'));
});
