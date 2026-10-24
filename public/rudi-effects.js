/* Global, noninteractive RUDI weather and celebration effects. */
(()=>{
'use strict';
const TZ='Europe/Moscow';
const FALLBACK=[{name:'Рустам',month:3,day:3},{name:'Диана',month:6,day:30},{name:'Лулу',month:5,day:5}];
let actor='',birthdays=FALLBACK,initialized=false,weatherEnabled=true,weather='',flight=null,shownModal=false;
function moscow(now=new Date()){
 const p=Object.fromEntries(new Intl.DateTimeFormat('en-GB',{timeZone:TZ,year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).formatToParts(now).map(x=>[x.type,x.value]));
 return {year:+p.year,month:+p.month,day:+p.day,hour:+p.hour,minute:+p.minute,key:p.year+'-'+p.month+'-'+p.day};
}
function classify(code){
 if(code===null||code===undefined||code==='')return '';
 const c=Number(code);if(!Number.isFinite(c))return '';
 if([71,73,75,77,85,86].includes(c))return 'snow';
 if([51,53,55,56,57,61,63,65,66,67,80,81,82,95,96,99].includes(c))return 'rain';
 return '';
}
function newYear(now){return(now.month===12&&now.day===31&&now.hour===23&&now.minute>=55)||(now.month===1&&now.day===1&&now.hour<5)}
function birthdayNow(now,list=birthdays){return(Array.isArray(list)?list:[]).filter(b=>+b.month===now.month&&+b.day===now.day)}
const motion=()=>!window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches;
function key(type){return 'rudi:weather-effects:'+type+':'+(actor==='Диана'?'diana':'rustam')}
function enabled(type){try{return localStorage.getItem(key(type))!=='0'}catch(_){return true}}
function setEnabled(type,on){if(!['rain','snow'].includes(type))return;try{localStorage.setItem(key(type),on?'1':'0')}catch(_){}
 updateSettings();window.RUDI_EFFECTS?.onSettingChanged?.(type,Boolean(on));tick()}
function layer(){let host=document.getElementById('rudiEffectsLayer');if(!host){host=document.createElement('div');host.id='rudiEffectsLayer';host.className='rudi-effects-layer';host.setAttribute('aria-hidden','true');document.body.appendChild(host)}return host}
function remove(type){document.getElementById('rudi-effect-'+type)?.remove()}
function particles(type){
 const host=document.createElement('div');host.id='rudi-effect-'+type;host.className='rudi-effect rudi-effect-'+type;
 host.setAttribute('aria-hidden','true');
 const count=type==='rain'?32:type==='snow'?24:type==='balloons'?16:7;
 const colors=['#fe719e','#ffd175','#7dccef','#a994fa','#a1e1b0','#ffa982'];
 for(let i=0;i<count;i++){
  const el=document.createElement('span');el.className='rudi-particle';
  const set=(k,v)=>el.style.setProperty(k,String(v));
  set('--x',((i*43+9)%96+2)+'%');set('--delay',(-i*.75)+'s');
  if(type==='rain'){set('--dur',(.8+i%5*.19)+'s');set('--opa',.3+i%4*.12)}
  if(type==='snow'){set('--dur',(7+i%8*1.6)+'s');set('--drift',((i%7-3)*19)+'px');set('--scale',.6+i%5*.15);el.textContent=i%4?'❄':'✦'}
  if(type==='balloons'){set('--dur',(11+i%7*1.7)+'s');set('--drift',((i%5-2)*30)+'px');set('--color',colors[i%colors.length]);set('--scale',.65+i%4*.14)}
  if(type==='fireworks'){set('--y',(16+i%4*17)+'%');set('--dur',(2.7+i%3*.3)+'s');set('--color',colors[i%colors.length])}
  host.appendChild(el);
 }
 layer().appendChild(host);
}
function show(type,should){const present=!!document.getElementById('rudi-effect-'+type);
 if(!should||document.hidden||!motion()){if(present)remove(type)}else if(!present)particles(type)}
let victoryTimer=0;
function celebrateVictory(winner){
 if(!['Рустам','Диана'].includes(winner)||document.body.dataset.rudiActor!==winner||document.hidden)return;
 document.getElementById('rudiBattleVictory')?.remove();clearTimeout(victoryTimer);
 const host=document.createElement('div');host.id='rudiBattleVictory';host.className='rudi-battle-victory';host.setAttribute('role','status');
 const title=document.createElement('strong');title.textContent=winner+(winner==='Диана'?' победила!':' победил!');host.append(title);
 if(motion()){
  const fireworks=document.createElement('div');fireworks.className='rudi-effect rudi-effect-fireworks';fireworks.setAttribute('aria-hidden','true');
  const colors=['#fe719e','#ffd175','#7dccef','#a994fa','#a1e1b0','#ffa982'];
  for(let i=0;i<9;i++){const spark=document.createElement('span');spark.className='rudi-particle';spark.style.cssText='--x:'+((i*43+9)%90+5)+'%;--y:'+(15+i%4*19)+'%;--dur:2.7s;--delay:'+(-i*.4)+'s;--color:'+colors[i%colors.length];fireworks.append(spark)}
  host.prepend(fireworks);
 }
 document.body.append(host);victoryTimer=setTimeout(()=>host.remove(),4000);
}
function updateSettings(){for(const type of ['rain','snow']){const el=document.getElementById('rudiWeather'+(type==='rain'?'Rain':'Snow')+'Switch');el?.setAttribute('aria-checked',enabled(type)?'true':'false')}}
function installSettings(){
 const panel=document.getElementById('homeSettingsPanel');
 if(!panel||document.getElementById('rudiWeatherEffectsSettings'))return;
 const group=document.createElement('section');group.className='settings-group';group.id='rudiWeatherEffectsSettings';
 const title=document.createElement('div');title.className='settings-group-title';title.textContent='Анимация погоды';group.appendChild(title);
 for(const [type,name,description]of[['rain','Дождь','Капли, когда на улице дождь'],['snow','Снег','Снежинки, когда на улице снег']]){
  const row=document.createElement('div');row.className='home-settings-row';
  const copy=document.createElement('div');copy.className='home-settings-copy';
  const strong=document.createElement('strong');strong.textContent=name;
  const small=document.createElement('small');small.textContent=description;copy.append(strong,small);
  const button=document.createElement('button');button.type='button';button.id='rudiWeather'+(type==='rain'?'Rain':'Snow')+'Switch';
  button.className='market-ticker-toggle';button.setAttribute('role','switch');button.setAttribute('aria-label','Анимация: '+name);
  const thumb=document.createElement('span');thumb.className='market-ticker-toggle-thumb';thumb.setAttribute('aria-hidden','true');button.appendChild(thumb);
  button.addEventListener('click',()=>setEnabled(type,!enabled(type)));row.append(copy,button);group.appendChild(row);
 }
 const interfaceGroup=[...panel.querySelectorAll('.settings-group')].find(x=>x.querySelector('.settings-group-title')?.textContent==='Интерфейс');
 if(interfaceGroup)interfaceGroup.after(group);else panel.insertBefore(group,panel.firstChild);
 updateSettings();
}
function birthdayWindow(day,celebrant){
 if(shownModal||!['Рустам','Диана'].includes(celebrant))return;
 const seen='rudi:birthday:greeting:v1:'+celebrant+':'+day.key;
 try{if(localStorage.getItem(seen)==='1')return}catch(_){}
 const backdrop=document.createElement('div');backdrop.className='rudi-birthday-modal';backdrop.id='rudiBirthdayGreeting';
 const decorations=document.createElement('div');decorations.className='rudi-birthday-decorations';decorations.setAttribute('aria-hidden','true');
 const colors=['#ff7ab8','#ffc866','#8cdbf8','#b4a0f8','#9ce6c1'];
 for(let i=0;i<13;i++){
  const balloon=document.createElement('span');balloon.className='rudi-particle';
  balloon.style.setProperty('--x',((i*37+11)%92+3)+'%');
  balloon.style.setProperty('--delay',(-i*.93)+'s');
  balloon.style.setProperty('--dur',(9+i%6*1.2)+'s');
  balloon.style.setProperty('--drift',((i%5-2)*23)+'px');
  balloon.style.setProperty('--scale',.65+i%4*.14);
  balloon.style.setProperty('--color',colors[i%colors.length]);
  decorations.appendChild(balloon);
 }
 const sheet=document.createElement('section');sheet.className='rudi-birthday-card';sheet.setAttribute('role','dialog');sheet.setAttribute('aria-modal','true');sheet.setAttribute('aria-labelledby','rudiBirthdayTitle');
 const icon=document.createElement('div');icon.className='rudi-birthday-emblem';icon.textContent='🎂';
 const heading=document.createElement('h2');heading.id='rudiBirthdayTitle';heading.textContent='С днём рождения, '+celebrant+'!';
 const message=document.createElement('p');message.className='rudi-birthday-message';
 message.textContent=celebrant==='Рустам'?'Рустам, пусть впереди будет много счастливых моментов с Дианой и Лулу, вдохновения и исполнения самых важных желаний!':'Диана, желаем тебе любви, ярких впечатлений, душевного тепла и счастливых моментов с Рустамом и Лулу!';
 const foot=document.createElement('div');foot.className='rudi-birthday-note';foot.textContent='Создаём личное поздравление…';
 const button=document.createElement('button');button.type='button';button.className='rudi-birthday-accept';button.textContent='Спасибо! ❤️';
 button.addEventListener('click',()=>{backdrop.remove();shownModal=false});
 sheet.append(icon,heading,message,foot,button);backdrop.append(decorations,sheet);document.body.appendChild(backdrop);shownModal=true;
 try{localStorage.setItem(seen,'1')}catch(_){}
 button.focus({preventScroll:true});
 fetch('/api/index?route=birthday-greeting',{method:'POST',headers:{'Content-Type':'application/json'},credentials:'same-origin',cache:'no-store',body:JSON.stringify({initData:window.Telegram?.WebApp?.initData||'',birthdayName:celebrant})})
  .then(r=>r.ok?r.json():Promise.reject(Error('unavailable')))
  .then(data=>{if(!backdrop.isConnected)return;if(data?.greeting)message.textContent=String(data.greeting).slice(0,850);
    foot.textContent=data?.aiGenerated?'Личное поздравление от РуДи ✨':'С любовью от РуДи ✨'})
  .catch(()=>{if(backdrop.isConnected)foot.textContent='С любовью от РуДи ✨'});
}
function tick(now=new Date()){
 if(!initialized)return;
 const d=moscow(now),birthday=birthdayNow(d);
 show('rain',weatherEnabled&&weather==='rain'&&enabled('rain'));
 show('snow',weatherEnabled&&weather==='snow'&&enabled('snow'));
 show('balloons',birthday.length>0);
 show('fireworks',newYear(d));
 const human=birthday.find(x=>x.name==='Рустам'||x.name==='Диана');
 if(human)birthdayWindow(d,human.name);
}
async function refreshWeather(){
 if(!initialized||document.hidden||!weatherEnabled||flight||!window.RUDI_WEATHER?.get)return;
 flight=Promise.resolve().then(()=>window.RUDI_WEATHER.get()).then(data=>{
  const age=Date.now()-Number(data?.fetchedAt||0);
  weather=age>=0&&age<35*60*1000?classify(data?.current?.weather_code):'';
 }).catch(()=>{weather=''}).finally(()=>{flight=null;tick()});
 return flight;
}
function init({actor:name,birthdays:dates,weatherEnabled:enabledWeather}={}){
 if(!['Рустам','Диана'].includes(name))return;
 actor=name;birthdays=Array.isArray(dates)&&dates.length?dates:FALLBACK;
 weatherEnabled=enabledWeather!==false;initialized=true;
 installSettings();tick();void refreshWeather();
}
document.addEventListener('visibilitychange',()=>{if(document.hidden){for(const type of ['rain','snow','balloons','fireworks'])remove(type)}else{tick();void refreshWeather()}});
window.addEventListener('pageshow',()=>{if(initialized){installSettings();tick();void refreshWeather()}});
setInterval(()=>{if(initialized&&!document.hidden){installSettings();tick()}},30000);
setInterval(()=>{if(initialized&&!document.hidden)void refreshWeather()},15*60*1000);
window.RUDI_EFFECTS={init,tick,enabled,setEnabled,installSettings,refreshWeather,celebrateVictory,onSettingChanged:null,logic:{moscow,classify,newYear,birthdayNow}};
})();
