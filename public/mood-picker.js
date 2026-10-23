(function(root,factory){
  const catalog=typeof module==='object'&&module.exports?require('./mood-catalog.js'):root.RudiMoodCatalog;
  const api=factory(catalog);
  if(typeof module==='object'&&module.exports)module.exports=api;
  else root.RudiMoodPicker=api;
})(typeof globalThis!=='undefined'?globalThis:this,function(catalog){
  'use strict';
  const reasons=[['work','Работа'],['relationship','Отношения'],['health','Здоровье'],['sleep','Сон'],['food','Еда'],['sport','Спорт'],['money','Деньги'],['other','Свой ответ']];
  const reasonEmoji={work:'💼',relationship:'❤️',health:'🩺',sleep:'😴',food:'🍽️',sport:'🏃',money:'💰',other:'✍️'};
  const subEmoji={
   'Счастье':'😊','Восторг':'🤩','Ликование':'🥳','Умиротворение':'😌','Интерес':'🤔','Любопытство':'🧐','Надежда':'🌟',
   'Бешенство':'🤬','Ярость':'😡','Злость':'😠','Раздражение':'😤','Обида':'😞','Ревность':'😒','Стыд':'😳',
   'Тревога':'😰','Беспокойство':'😟','Ужас':'😱','Испуг':'😨','Страх':'😨','Сомнение':'🤨','Вина, стыд':'😔',
   'Тоска':'🥺','Печаль':'😢','Горечь':'😞','Разочарование':'😕','Скука':'🥱','Безнадёжность':'😔',
   'Нежность':'🥰','Теплота':'💗','Благодарность':'🙏','Доверие':'🤝','Спокойствие':'😌','Влюблённость':'😍','Уважение':'💜'
  };
  function createFlow(options={}){
    const state={step:0,mood:'',submood:'',reason:'',reasonText:'',busy:false,closed:false,error:''};
    const editable=()=>!state.busy&&!state.closed;
    const changed=()=>options.onChange?.(state);
    function finish(){state.closed=true;changed();options.onClose?.()}
    return {state,
      chooseMood(mood){if(!editable()||!catalog.groups.some(g=>g.key===mood))return;Object.assign(state,{mood,submood:'',reason:'',reasonText:'',step:catalog.groups.find(g=>g.key===mood).submoods.length?1:2,error:''});changed()},
      chooseSubmood(value){if(!editable()||state.step!==1)return;const submood=catalog.normalizeSubmood(state.mood,value);if(!submood)return;Object.assign(state,{submood,step:2,error:''});changed()},
      chooseReason(reason,text=''){if(!editable()||state.step!==2||!(reason===''||reasons.some(r=>r[0]===reason)))return;Object.assign(state,{reason,reasonText:reason==='other'?String(text).trim().slice(0,160):'',error:''});changed()},
      back(){if(!editable())return;state.step=state.step===2&&state.mood==='neutral'?0:Math.max(0,state.step-1);state.error='';changed()},
      cancel(){if(editable())finish()},
      analyze(){if(!editable())return;finish();options.onAnalyze?.()},
      async save(){
        if(!editable()||state.step!==2)return false;
        if(state.reason==='other'&&!state.reasonText){state.error='Напишите, что повлияло, или пропустите этот шаг.';changed();return false}
        state.busy=true;state.error='';changed();
        try{await options.onSave?.({mood:state.mood,submood:state.submood,reason:state.reason,reasonText:state.reasonText});state.busy=false;finish();return true}
        catch(_){state.busy=false;state.error='Не удалось сохранить. Попробуйте ещё раз — ваш выбор сохранён в окне.';changed();return false}
      }
    };
  }
  let active=null;
  function open(options={}){
    if(active)return;
    const previous=document.activeElement,previousOverflow=document.body.style.overflow;
    const overlay=document.createElement('div');overlay.id='moodPickerOverlay';overlay.className='weather-forecast-backdrop mood-picker-backdrop';
    overlay.innerHTML='<section id="moodPickerDialog" class="weather-forecast-dialog mood-picker-dialog" role="dialog" aria-modal="true" aria-labelledby="moodPickerTitle"><header><button type="button" class="mood-picker-back">Назад</button><h2 id="moodPickerTitle">Настроение</h2><button type="button" class="weather-forecast-close" aria-label="Закрыть">×</button></header><p class="mood-picker-progress" aria-live="polite"></p><div class="weather-forecast-content mood-picker-content"><p class="mood-picker-selection"></p><h3 class="mood-picker-question" tabindex="-1"></h3><div class="mood-picker-options"></div><form class="mood-picker-custom" hidden><label for="moodPickerReason">Что повлияло?</label><input id="moodPickerReason" type="text" maxlength="160" autocomplete="off" placeholder="Напишите свой ответ"><button type="submit">Сохранить</button></form><p class="mood-picker-error" role="alert"></p><button type="button" class="mood-picker-skip" hidden>Пропустить и сохранить</button></div><footer><button type="button" class="mood-picker-analyze">Анализ настроения</button></footer></section>';
    const query=selector=>overlay.querySelector(selector);
    const controls=query('.mood-picker-options'),question=query('.mood-picker-question'),custom=query('form'),input=query('input');
    let renderedStep=-1;
    function close(){
      document.removeEventListener('keydown',keydown,true);overlay.remove();document.body.style.overflow=previousOverflow;active=null;
      previous?.focus?.({preventScroll:true});options.onClose?.();
    }
    function button(label,callback,emoji=''){const item=document.createElement('button');item.type='button';if(emoji){const span=document.createElement('span');span.className='mood-picker-option-emoji';span.textContent=emoji;span.setAttribute('aria-hidden','true');item.append(span,' ')}item.append(document.createTextNode(label));item.addEventListener('click',callback);controls.append(item)}
    function render(state){
      if(state.closed)return;
      const stepChanged=renderedStep!==state.step;renderedStep=state.step;
      query('.mood-picker-progress').textContent='Шаг '+(state.step+1)+' из 3';
      query('.mood-picker-selection').textContent=[catalog.meta[state.mood]?.label,state.submood].filter(Boolean).join(' · ');
      question.textContent=['Какое настроение?','Что именно вы чувствуете?','Что повлияло?'][state.step];
      controls.replaceChildren();
      if(state.step===0)catalog.groups.forEach(group=>button(group.label,()=>flow.chooseMood(group.key),group.emoji));
      if(state.step===1)catalog.groups.find(g=>g.key===state.mood).submoods.forEach(label=>button(label,()=>flow.chooseSubmood(label),subEmoji[label]||catalog.meta[state.mood]?.emoji||'💭'));
      if(state.step===2)reasons.forEach(([key,label])=>button(label,()=>{
        flow.chooseReason(key);
        if(key==='other')input.focus({preventScroll:true});else flow.save();
      },reasonEmoji[key]));
      custom.hidden=state.step!==2||state.reason!=='other';
      query('.mood-picker-back').hidden=state.step===0;
      query('.mood-picker-skip').hidden=state.step!==2;
      query('.mood-picker-error').textContent=state.error;
      overlay.querySelectorAll('button,input').forEach(item=>{item.disabled=state.busy});
      overlay.setAttribute('aria-busy',String(state.busy));
      if(stepChanged){query('.mood-picker-content').scrollTop=0;question.focus({preventScroll:true})}
    }
    const flow=createFlow({...options,onChange:render,onClose:close});
    active=flow;document.body.append(overlay);document.body.style.overflow='hidden';render(flow.state);
    query('.weather-forecast-close').addEventListener('click',()=>flow.cancel());
    query('.mood-picker-back').addEventListener('click',()=>flow.back());
    query('.mood-picker-analyze').addEventListener('click',()=>flow.analyze());
    query('.mood-picker-skip').addEventListener('click',()=>{flow.chooseReason('');flow.save()});
    custom.addEventListener('submit',event=>{event.preventDefault();flow.chooseReason('other',input.value);flow.save()});
    overlay.addEventListener('click',event=>{if(event.target===overlay)flow.cancel()});
    function keydown(event){
      if(event.key==='Escape'){event.preventDefault();event.stopPropagation();flow.cancel();return}
      if(event.key!=='Tab')return;
      const items=[...overlay.querySelectorAll('button,input')].filter(el=>!el.disabled&&!el.hidden&&!el.closest('[hidden]'));
      const first=items[0],last=items[items.length-1];
      if(!first){event.preventDefault();return}
      if(event.shiftKey&&(document.activeElement===first||!items.includes(document.activeElement))){event.preventDefault();last.focus()}
      else if(!event.shiftKey&&(document.activeElement===last||!items.includes(document.activeElement))){event.preventDefault();first.focus()}
    }
    document.addEventListener('keydown',keydown,true);
  }
  return {createFlow,open,close(){active?.cancel()},isOpen(){return Boolean(active)}};
});
