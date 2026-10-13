/* Guided meditation soundscape and Russian narration, entirely on-device. */
(()=>{'use strict';
const PRACTICES=[
 {id:'morning',name:'Доброе утро',time:5,icon:'☀️',desc:'Мягко начать день',lines:['Устройся удобно. Сделай мягкий вдох и медленный выдох. У этого утра есть время для тебя.','Почувствуй опору под ногами. Заметь звуки вокруг, не оценивая их.','Подумай об одном деле, которому сегодня хочешь уделить внимание. Не нужно делать всё сразу.','Если ум уходит к списку задач, спокойно верни внимание к дыханию.','Постепенно открой глаза. Выбери первый небольшой шаг своего дня.']},
 {id:'sleep',name:'Перед сном',time:20,icon:'🌙',desc:'Отпустить мысли перед сном',lines:['Устройся удобно. Если хочется, закрой глаза. Нет необходимости заставлять себя уснуть.','Медленно расслабь лоб, челюсть и плечи. Позволь дыханию идти своим ритмом.','Перенеси внимание к рукам, животу и ногам. Пусть всё тело немного потяжелеет.','Когда появляются мысли, мягко замечай их и отпускай, как облака, проходящие мимо.','Сейчас ничего не нужно решать. Можно просто отдыхать.']},
 {id:'stress',name:'Снять напряжение',time:10,icon:'🌿',desc:'Вернуться в настоящий момент',lines:['Остановись на минуту. Найди удобное положение и почувствуй поверхность под собой.','Заметь три звука вокруг и два ощущения в теле. Ты можешь просто наблюдать их.','Сделай спокойный вдох. Выдыхай чуть длиннее, если это комфортно. Не задерживай дыхание.','Обрати внимание на плечи и ладони. Если они напряжены, попробуй мягко их расслабить.','Отметь, что изменилось в твоём состоянии. Любой результат подходит.']},
 {id:'focus',name:'Фокус',time:10,icon:'🎯',desc:'Собраться перед работой',lines:['Отложи отвлечения. Почувствуй, как ты сидишь и дышишь.','Выбери одну задачу, которая сейчас действительно важна.','Когда внимание уходит, это нормально. Верни его к дыханию, а потом снова к выбранной задаче.','Представь, как начинаешь с самого простого действия, без попытки сделать всё сразу.','Готово. Вернись к своей задаче с одним ясным следующим шагом.']},
 {id:'mindful',name:'Осознанность',time:10,icon:'🧘',desc:'Замечать, не оценивать',lines:['Направь внимание на естественное дыхание. Не нужно менять его темп.','Замечай ощущения в теле. Тепло, прохладу, прикосновение одежды.','Появилась мысль? Мысленно назови её мыслью и вернись к настоящему моменту.','Позволь звукам приходить и уходить. Не удерживай их.','Отметь своё состояние с доброжелательным вниманием.']},
 {id:'confidence',name:'Уверенность',time:10,icon:'✨',desc:'Спокойно подготовиться к делу',lines:['Сядь устойчиво. Отметь, что уже справлялся с непростыми задачами.','Вспомни один момент, когда действовал несмотря на сомнения.','Представь важный разговор или задачу. Что поможет действовать спокойно и последовательно?','Не требуй от себя идеального результата. Достаточно следующего разумного шага.','Сохрани это ощущение опоры и постепенно возвращайся к делам.']},
 {id:'reset',name:'Перезагрузка',time:5,icon:'🔄',desc:'Пять минут без перегруза',lines:['Сейчас можно на время отложить поток информации.','Почувствуй стопы, ладони и положение спины.','Медленно осмотрись вокруг. Заметь цвета и формы.','Пусть мысли идут своим чередом. Тебе не нужно отвечать на каждую.','Сделай один спокойный вдох и возвращайся к делам в удобном темпе.']},
 {id:'body',name:'Сканирование тела',time:20,icon:'💆',desc:'Последовательно расслабиться',lines:['Если удобно, закрой глаза. Перенеси внимание к стопам и пальцам ног.','Мягко замечай ощущения в голенях, коленях и бёдрах. Ничего не нужно менять.','Перенеси внимание к животу, спине, плечам и рукам.','Расслабь челюсть и лоб, если чувствуешь напряжение.','Ощути всё тело целиком. Поблагодари себя за это время отдыха.']},
 {id:'walk',name:'Прогулка',time:10,icon:'🚶',desc:'Внимание на шаги и звуки',lines:['Иди в безопасном месте. Смотри по сторонам и сохраняй внимание к дороге.','Обрати внимание на контакт стоп с поверхностью.','Заметь температуру воздуха и окружающие звуки.','Позволь вниманию мягко возвращаться к движению, когда замечаешь мысли.','Продолжай прогулку в своём темпе.']},
 {id:'emotions',name:'Принять эмоции',time:10,icon:'💛',desc:'Бережно прожить чувства',lines:['Заметь, какую эмоцию сейчас испытываешь. Попробуй назвать её простым словом.','Где в теле ты её ощущаешь? Не нужно пытаться избавиться от чувства.','Скажи себе, что чувство может присутствовать, пока ты заботишься о себе.','Почувствуй опору под ногами и пространство вокруг.','Спроси себя, что могло бы поддержать тебя сегодня.']},
 {id:'vision',name:'Визуализация',time:10,icon:'🏔️',desc:'Увидеть свою ближайшую цель',lines:['Устройся удобно и выбери достижимую цель.','Представь конкретный момент, когда ты делаешь шаг к ней.','Что может помешать? Мысленно наметь простой план на такой случай.','Вернись к дыханию. Не нужно предсказывать будущее или гарантировать результат.','Выбери один реальный шаг, который сделаешь после практики.']},
 {id:'breath',name:'Дыхание 4/6',time:5,icon:'🫁',desc:'Плавный вдох и удлинённый выдох',lines:['Если тебе комфортно, попробуй вдох примерно на четыре счёта, а выдох на шесть. Без усилия.','Следуй за движением круга. Если ритм неудобен, дыши естественно.','Отметь, как воздух входит и выходит. Не нужно задерживать дыхание.','Позволь плечам расслабиться. Продолжай в мягком темпе.','Постепенно вернись к своему естественному дыханию.']}
];
const MOODS=[['stress','Напряжение','stress'],['tired','Усталость','body'],['sleep','Не спится','sleep'],['focus','Нужен фокус','focus'],['calm','Для себя','mindful']];
const SOUNDS=[['rain','Дождь'],['ocean','Океан'],['forest','Лес'],['fire','Камин'],['brown','Глубокий шум'],['bowls','Поющие чаши'],['music','Тихая музыка'],['none','Без фона']];
const $=id=>document.getElementById(id);
let el=null,actor='',practice='stress',mood='stress',sound='rain',voice='female',volume=35,program=7;
let audioCtx=null,master=null,cleanups=[],speakingFor=null,spoken=new Set(),speechAllowed=false,activeId='',savedId='';
const optionHtml=(items,current)=>items.map(item=>'<option value="'+item[0]+'"'+(item[0]===current?' selected':'')+'>'+item[1]+'</option>').join('');
const chosen=()=>PRACTICES.find(item=>item.id===practice)||PRACTICES[2];
const storageKey=s=>'rudi:meditation:'+actor+':guided:'+s;
function save(s,v){if(!actor)return;try{localStorage.setItem(storageKey(s),String(v))}catch{}}
function read(s,fallback){try{return localStorage.getItem(storageKey(s))||fallback}catch{return fallback}}
function labelFor(id){try{const value=localStorage.getItem(storageKey('session:'+id));return PRACTICES.find(x=>x.id===value)?.name||''}catch{return ''}}
function remember(id){if(id)save('session:'+id,practice)}
function onActor(name){
 if(!['Рустам','Диана'].includes(name))return;
 actor=name;
 practice=PRACTICES.some(x=>x.id===read('practice','stress'))?read('practice','stress'):'stress';
 sound=SOUNDS.some(x=>x[0]===read('sound','rain'))?read('sound','rain'):'rain';
 voice=['female','male','neutral','none'].includes(read('voice','female'))?read('voice','female'):'female';
 mood=MOODS.some(x=>x[0]===read('mood','stress'))?read('mood','stress'):'stress';
 volume=Math.max(0,Math.min(100,Number(read('volume','35'))||0));
 program=[7,14,30].includes(Number(read('program','7')))?Number(read('program','7')):7;
 render();
}
function mount(page){
 if(el)return;
 el=document.createElement('section');el.className='meditation-guide-panel';el.setAttribute('aria-label','Выбор медитации');
 el.innerHTML=
  '<div class="meditation-guide-heading"><h3>Как ты сейчас?</h3><p>Подберём практику под настроение</p></div>'+
  '<div id="meditationMoods" class="meditation-moods" role="group" aria-label="Выбор состояния">'+MOODS.map(x=>'<button type="button" data-med-mood="'+x[0]+'">'+x[1]+'</button>').join('')+'</div>'+
  '<div class="meditation-guide-heading"><h3>Практики</h3><p>Выбери то, что нужно сейчас</p></div>'+
  '<div id="meditationPracticeList" class="meditation-practice-list" role="group" aria-label="Выбор практики">'+PRACTICES.map(x=>'<button type="button" class="meditation-practice-card" data-med-practice="'+x.id+'"><span class="meditation-practice-icon" aria-hidden="true">'+x.icon+'</span><span><strong>'+x.name+'</strong><small>'+x.desc+'</small></span></button>').join('')+'</div>'+
  '<div class="meditation-guide-heading"><h3>Звуки и озвучка</h3><p>Звуки воспроизводятся на устройстве, без интернета</p></div>'+
  '<div class="meditation-guide-controls"><label>Голос<select id="meditationVoice"><option value="female">Женский (если доступен)</option><option value="male">Мужской (если доступен)</option><option value="neutral">Любой русский</option><option value="none">Без голоса</option></select></label>'+
  '<label>Звуковой фон<select id="meditationAmbient">'+optionHtml(SOUNDS,sound)+'</select></label></div>'+
  '<label class="meditation-volume-label">Громкость фона <span id="meditationVolumeText">35%</span><input id="meditationVolume" type="range" min="0" max="100" step="5" value="35" aria-label="Громкость фона"></label>'+
  '<div class="meditation-guide-program"><label for="meditationProgram">Привычка на</label><select id="meditationProgram"><option value="7">7 дней</option><option value="14">14 дней</option><option value="30">30 дней</option></select><span id="meditationProgramProgress"></span></div>'+
  '<p class="meditation-audio-note" id="meditationAudioNote">Озвучка зависит от доступных русских голосов устройства. Встроенный браузер может останавливать звук при блокировке экрана.</p>'+
  '<button type="button" class="meditation-resume-audio" id="meditationResumeAudio" hidden>Включить сопровождение текущего сеанса</button>';
 page.querySelector('#meditationQuote').insertAdjacentElement('afterend',el);
 $('meditationMoods').addEventListener('click',event=>{
  const btn=event.target.closest('[data-med-mood]');if(!btn||activeId)return;
  mood=btn.dataset.medMood;practice=MOODS.find(x=>x[0]===mood)[2];
  save('mood',mood);save('practice',practice);render();chooseGoal();
 });
 $('meditationPracticeList').addEventListener('click',event=>{
  const btn=event.target.closest('[data-med-practice]');if(!btn||activeId)return;
  practice=btn.dataset.medPractice;save('practice',practice);render();chooseGoal();
 });
 $('meditationVoice').addEventListener('change',event=>{voice=event.target.value;save('voice',voice);if(voice==='none')cancelSpeech();render()});
 $('meditationAmbient').addEventListener('change',event=>{sound=event.target.value;save('sound',sound);if(activeId&&speechAllowed)startAmbient();render()});
 $('meditationVolume').addEventListener('input',event=>{volume=Number(event.target.value);save('volume',volume);if(master&&audioCtx)master.gain.setTargetAtTime(volume/100,audioCtx.currentTime,.07);render()});
 $('meditationProgram').addEventListener('change',event=>{program=Number(event.target.value);save('program',program);render()});
 $('meditationResumeAudio').addEventListener('click',()=>{prime();onStarted(activeId,true)});
 render();
}
function chooseGoal(){
 const current=chosen(),button=$('meditationDurations')?.querySelector('[data-med-goal="'+current.time+'"]');
 if(button&&!button.disabled)button.click();
}
function render(){
 if(!el)return;
 for(const b of el.querySelectorAll('[data-med-practice]')){b.setAttribute('aria-pressed',String(b.dataset.medPractice===practice));b.disabled=!!activeId}
 for(const b of el.querySelectorAll('[data-med-mood]')){b.setAttribute('aria-pressed',String(b.dataset.medMood===mood));b.disabled=!!activeId}
 if($('meditationVoice'))$('meditationVoice').value=voice;
 if($('meditationAmbient'))$('meditationAmbient').value=sound;
 if($('meditationVolume'))$('meditationVolume').value=String(volume);
 if($('meditationVolumeText'))$('meditationVolumeText').textContent=volume+'%';
 if($('meditationProgram'))$('meditationProgram').value=String(program);
 $('meditationResumeAudio').hidden=!activeId||speechAllowed;
 const streak=Number($('meditationStreak')?.textContent||0);
 if($('meditationProgramProgress'))$('meditationProgramProgress').textContent='Серия: '+Math.min(program,streak)+' из '+program+' дн.';
}
function note(t){const node=$('meditationAudioNote');if(node)node.textContent=t}
function prime(){
 try{if(window.AudioContext||window.webkitAudioContext){const C=window.AudioContext||window.webkitAudioContext; if(!audioCtx)audioCtx=new C();void audioCtx.resume()}}catch{}
 try{window.speechSynthesis?.resume()}catch{}
}
function closeContext(){
 if(master&&audioCtx){try{master.gain.setTargetAtTime(.0001,audioCtx.currentTime,.16)}catch{}}
 cleanups.forEach(fn=>{try{fn()}catch{}});cleanups=[];master=null;
 const old=audioCtx;audioCtx=null;
 if(old)setTimeout(()=>{try{void old.close()}catch{}},550);
}
function cancelSpeech(){try{window.speechSynthesis?.cancel()}catch{}}
function stopAudio(){speechAllowed=false;spoken.clear();speakingFor=null;cancelSpeech();closeContext();render()}
function addNoise(type,cutoff,base,fadeRate){
 const ctx=audioCtx,len=ctx.sampleRate*3,buffer=ctx.createBuffer(1,len,ctx.sampleRate),arr=buffer.getChannelData(0);
 let brown=0;for(let i=0;i<len;i++){const random=Math.random()*2-1; if(type==='brown'){brown=(brown+random*.025)/1.025;arr[i]=Math.max(-1,Math.min(1,brown*3.5))}else arr[i]=random}
 const src=ctx.createBufferSource();src.buffer=buffer;src.loop=true;
 const filter=ctx.createBiquadFilter();filter.type=cutoff<600?'lowpass':'highpass';filter.frequency.value=cutoff;
 const gain=ctx.createGain();gain.gain.value=base;
 src.connect(filter);filter.connect(gain);gain.connect(master);
 if(fadeRate){
  const lfo=ctx.createOscillator(),depth=ctx.createGain();lfo.frequency.value=fadeRate;depth.gain.value=base*.55;
  lfo.connect(depth);depth.connect(gain.gain);lfo.start();cleanups.push(()=>lfo.stop())
 }
 src.start();cleanups.push(()=>src.stop());
}
function tone(hz,sec,level=.09){
 if(!audioCtx||!master)return;
 const t=audioCtx.currentTime,osc=audioCtx.createOscillator(),gain=audioCtx.createGain();
 osc.type='sine';osc.frequency.value=hz;gain.gain.setValueAtTime(.0001,t);
 gain.gain.exponentialRampToValueAtTime(Math.max(.001,level),t+.08);
 gain.gain.exponentialRampToValueAtTime(.0001,t+sec);
 osc.connect(gain);gain.connect(master);osc.start(t);osc.stop(t+sec+.04);
}
function clearSoundNodes(){
 cleanups.forEach(fn=>{try{fn()}catch{}});cleanups=[];
 try{master?.disconnect()}catch{};master=null;
}
function startAmbient(){
 clearSoundNodes();
 if(sound==='none'||!activeId||!speechAllowed)return;
 try{
  const C=window.AudioContext||window.webkitAudioContext;if(!C){note('Фоновое аудио не поддерживается этим браузером');return}
  if(!audioCtx||audioCtx.state==='closed')audioCtx=new C();void audioCtx.resume();
  master=audioCtx.createGain();master.gain.value=Math.max(.0001,volume/100);master.connect(audioCtx.destination);
  if(sound==='rain')addNoise('white',850,.37,0);
  else if(sound==='ocean')addNoise('brown',520,.43,.13);
  else if(sound==='forest')addNoise('brown',530,.27,.18);
  else if(sound==='fire')addNoise('white',1500,.23,1.7);
  else if(sound==='brown')addNoise('brown',450,.51,0);
  else if(sound==='bowls'){tone(220,5,.26);tone(331,5,.07);const id=setInterval(()=>{tone(220,5,.26);tone(331,5,.07)},7500);cleanups.push(()=>clearInterval(id))}
  else if(sound==='music'){
   const notes=[174.61,220,261.63,329.63];notes.forEach((hz,i)=>{
    const osc=audioCtx.createOscillator(),gain=audioCtx.createGain();
    osc.type='sine';osc.frequency.value=hz;
    gain.gain.value=i===0?.075:.025;osc.connect(gain);gain.connect(master);osc.start();
    cleanups.push(()=>osc.stop());
   });
  }
  if(sound==='forest'){
   const id=setInterval(()=>{if(audioCtx&&master){tone(800+Math.random()*500,.22,.04);setTimeout(()=>tone(1000+Math.random()*500,.18,.035),230)}},4600);
   cleanups.push(()=>clearInterval(id));
  }
  if(sound==='fire'){const id=setInterval(()=>tone(120+Math.random()*200,.045,.045),1500);cleanups.push(()=>clearInterval(id))}
 }catch{note('Не удалось запустить звуковой фон на этом устройстве');closeContext()}
}
function voiceChoice(){
 const voices=window.speechSynthesis?.getVoices?.()||[];
 const ru=voices.filter(x=>/^ru([-_]|$)/i.test(x.lang||''));
 if(!ru.length)return null;
 if(voice==='neutral')return ru[0];
 const female=/milena|irina|tatyana|anna|alena|elena|katya|female|жен|мария|оксана|юлия|google русский/i;
 const male=/yuri|pavel|alexander|dmitry|male|муж|юрий|александр|максим|михаил/i;
 return ru.find(x=>(voice==='female'?female:male).test(x.name||''))||ru[0];
}
function speak(line){
 if(!speechAllowed||voice==='none'||!line)return;
 if(!window.speechSynthesis||!window.SpeechSynthesisUtterance){note('Русская озвучка недоступна в этом браузере. Фон и таймер продолжают работать.');return}
 try{
  cancelSpeech();
  const utterance=new SpeechSynthesisUtterance(line);utterance.lang='ru-RU';utterance.rate=.87;utterance.pitch=voice==='male'?.9:1;utterance.volume=.9;
  const found=voiceChoice();if(found)utterance.voice=found;
  window.speechSynthesis.speak(utterance);
 }catch{note('Браузер не смог запустить озвучку. Можно продолжить без голоса.')}
}
function onStarted(id,resume=false){
 if(!id)return;
 activeId=id;spoken.clear();speechAllowed=true;speakingFor=practice;
 startAmbient();render();
 if(!resume)speak(chosen().lines[0]);
 note('Голос зависит от доступных русских голосов устройства. Если экран заблокирован, Telegram может приостановить звук.');
}
function onState(active){
 const id=active?.id||'';
 if(id===activeId)return;
 stopAudio();activeId=id;render();
}
function onFinish(){activeId='';stopAudio();$('meditationOrbit')?.classList.remove('is-guided');render()}
function onClose(){stopAudio();$('meditationOrbit')?.classList.remove('is-guided')}
function tick(active){
 if(!active||!activeId||!speechAllowed||active.id!==activeId)return;
 const total=Math.max(1,Number(active.goalMinutes)||10)*60;
 const elapsed=(Date.now()-Date.parse(active.startedAt))/1000;
 const phase=(Math.max(0,elapsed)%10);
 const breath=$('meditationBreathHint'),orbit=$('meditationOrbit');
 if(practice==='breath'){
  if(breath)breath.textContent=phase<4?'Вдох':'Выдох';
  orbit?.classList.add('is-guided');
 }else orbit?.classList.remove('is-guided');
 if(voice==='none'||document.hidden||speakingFor!==practice)return;
 const marks=[0,.14,.38,.63,.84],lines=chosen().lines;
 for(let i=1;i<marks.length;i++){
  if(spoken.has(i))continue;
  const when=marks[i]*total;
  if(elapsed>=when){
   spoken.add(i);
   if(elapsed-when<15){speak(lines[i]);break;}
  }
 }
}
function refreshProgram(){render()}
window.RudiMeditationAudio={mount,onActor,prime,onStarted,onState,onFinish,onClose,tick,remember,labelFor,refreshProgram};
})();