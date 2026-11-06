const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),{JSDOM}=require('jsdom');
test('partner meditation contains only emoji and duration',()=>{
 const dom=new JSDOM('<div id="homeDianaDetails"></div>'),source=fs.readFileSync('public/meditation.js','utf8');
 const ctx={actor:'Рустам',partner:{actor:'Диана',todaySessions:1,todayMinutes:5},document:dom.window.document,$:id=>dom.window.document.getElementById(id),formatDailyTime:m=>m+' мин',updateNudges(){}};
 vm.createContext(ctx);vm.runInContext(source.slice(source.indexOf('function updatePartner(){'),source.indexOf('async function refreshPartner(){')),ctx);ctx.updatePartner();assert.equal(ctx.document.getElementById('meditationPartnerSummary').textContent,'🧘 5 мин');dom.window.close();
});
test('partner profile moves meditation beside habits and restores it on close',async()=>{
 const dom=new JSDOM('<body data-app-tab="home"><section id="tile"><div class="profile-person-head"><div class="identity"><div class="person"><div class="profile-name-row"><span id="partnerHeaderName">Диана</span><span id="partnerMoodValue"></span></div></div></div></div><div class="profile-person-details"><div id="homePartnerHabitsSummary" class="profile-partner-habits-summary">🌱 Привычки: 3 из 3</div><div id="meditationPartnerSummary" class="meditation-partner-summary">🧘 5 мин</div></div></section></body>',{url:'https://rudi.test/',runScripts:'outside-only'}),w=dom.window;
 try{
  w.scrollTo=()=>{};w.fetch=async()=>({ok:false,json:async()=>({})});w.eval(fs.readFileSync('public/partner-profile.js','utf8'));w.RudiPartnerProfile.bind(w.document.getElementById('tile'),'Диана',{balance:()=>0,loadWishes:async()=>[]});await w.RudiPartnerProfile.openWish('Диана');
  const chip=w.document.querySelector('.partner-mood-meditation');assert.equal(chip.textContent,'🧘 5 мин');assert.ok(chip.previousElementSibling.classList.contains('partner-mood-habits'));assert.equal(w.document.querySelector('.partner-hero-bubble.is-meditation'),null);
  w.RudiPartnerProfile.close(true);assert.ok(w.document.querySelector('#tile .profile-person-details>#meditationPartnerSummary'));
 }finally{w.close()}
});

test('partner meditation summary hides on zero progress and reappears after meditation',()=>{
 const dom=new JSDOM('<div id="homeDianaDetails"></div>'),source=fs.readFileSync('public/meditation.js','utf8');
 const ctx={actor:'Рустам',partner:{actor:'Диана',todaySessions:0,todayMinutes:0},document:dom.window.document,$:id=>dom.window.document.getElementById(id),formatDailyTime:m=>m+' мин',updateNudges(){}};
 try{vm.createContext(ctx);vm.runInContext(source.slice(source.indexOf('function updatePartner(){'),source.indexOf('async function refreshPartner(){')),ctx);ctx.updatePartner();const card=ctx.document.getElementById('meditationPartnerSummary');assert.equal(card.hidden,true);assert.equal(card.dataset.meditatedToday,'false');ctx.partner.todaySessions=1;ctx.partner.todayMinutes=5;ctx.updatePartner();assert.equal(card.hidden,false);assert.equal(card.textContent,'🧘 5 мин');ctx.partner.todaySessions=0;ctx.partner.todayMinutes=0;ctx.updatePartner();assert.equal(card.hidden,true);}finally{dom.window.close()}
});
