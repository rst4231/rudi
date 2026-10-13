'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),vm=require('node:vm');
const file=fs.readFileSync('public/meditation-audio.js','utf8');
const existing=fs.readFileSync('public/meditation.js','utf8');
const html=fs.readFileSync('public/index.html','utf8');
const build=fs.readFileSync('build.cjs','utf8');
test('meditation player scripts parse and are loaded from the application shell',()=>{
 assert.doesNotThrow(()=>new vm.Script(file));
 assert.doesNotThrow(()=>new vm.Script(existing));
 assert.match(html,/src="\/meditation-audio\.js\?v=\d+\.\d+"/);
 assert.match(html,/href="\/meditation-audio\.css\?v=\d+\.\d+"/);
 assert.match(build,/meditation-audio\.js/);
 assert.match(build,/meditation-audio\.css/);
});
test('guided meditation offers twelve practices and at least seven distinct local sound types',()=>{
 for(const id of ['morning','sleep','stress','focus','mindful','confidence','reset','body','walk','emotions','vision','breath'])
  assert.ok(file.includes("id:'"+id+"'"),'missing practice: '+id);
 for(const id of ['rain','ocean','forest','fire','brown','bowls','music','none'])
  assert.ok(file.includes("['"+id+"'"),'missing sound: '+id);
 assert.match(file,/SpeechSynthesisUtterance/);
 assert.match(file,/window\.AudioContext/);
 assert.doesNotMatch(file,/fetch\(|https?:\/\//);
});
test('audio module isolates saved practice metadata by actor without changing existing API',()=>{
 const data=new Map();
 const sandbox={window:{},document:{getElementById:()=>null},localStorage:{getItem:k=>data.get(k)||null,setItem:(k,v)=>data.set(k,v)},setTimeout:()=>1,clearTimeout:()=>{},setInterval:()=>1,clearInterval:()=>{}};
 vm.runInNewContext(file,sandbox);
 const audio=sandbox.window.RudiMeditationAudio;
 for(const method of ['mount','onActor','prime','onStarted','onState','onFinish','onClose','tick','remember','labelFor'])
  assert.equal(typeof audio[method],'function',method);
 audio.onActor('Рустам');audio.remember('session1');
 assert.equal(audio.labelFor('session1'),'Снять напряжение');
 audio.onActor('Диана');assert.equal(audio.labelFor('session1'),'');
 audio.onActor('Рустам');assert.equal(audio.labelFor('session1'),'Снять напряжение');
 assert.match(existing,/RudiMeditationAudio\?\.onStarted/);
 assert.match(existing,/RudiMeditationAudio\?\.onFinish/);
 assert.match(existing,/RudiMeditationAudio\?\.onClose/);
 assert.match(existing,/RudiMeditationAudio\?\.tick/);
});
