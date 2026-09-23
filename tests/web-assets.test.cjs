const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const {spawnSync}=require('node:child_process');

test('built assets have stable content URLs, and editing one invalidates only that file',()=>{
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'rudi-assets-'));
  try{
    for(const file of ['build.cjs','runtime','config','rudi-version.json','public']) fs.cpSync(file,path.join(dir,file),{recursive:true});
    const build=()=>{
      const result=spawnSync(process.execPath,['build.cjs'],{cwd:dir,encoding:'utf8'});
      assert.equal(result.status,0,result.stderr);
      return fs.readFileSync(path.join(dir,'public/index.html'),'utf8');
    };
    const first=build();
    const js=first.match(/src="(\/assets\/app\.[a-f0-9]{12}\.js)"/);
    assert.ok(js,'app must use a content-addressed URL');
    const css=first.match(/href="(\/assets\/app\.[a-f0-9]{12}\.css)"/);
    assert.ok(css);
    for(const [,url] of first.matchAll(/(?:src|href)="(\/assets\/[^"?]+)"/g)){
      assert.ok(fs.statSync(path.join(dir,'public',url)).size>0,'missing '+url);
    }
    assert.equal(build(),first,'build must be idempotent');
    fs.appendFileSync(path.join(dir,'public/app.js'),'\n// changed asset\n');
    const second=build();
    assert.ok(!second.includes(js[1]),'changed script must get a new URL');
    assert.ok(second.includes(css[1]),'unchanged styles must keep their URL');
  }finally{fs.rmSync(dir,{recursive:true,force:true})}
});
