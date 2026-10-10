(()=>{
'use strict';
if(!/iPhone/i.test(navigator.userAgent||''))return;
const actor='Рустам',ttl=600000,key='rudi:iphone:rustam:unlock-until:v1';
let until=Number(sessionStorage.getItem(key)||0),locked=false,root=null,pending=false,sequence=0;
const eligible=()=>document.body.dataset.rudiActor===actor&&document.body.classList.contains('auth-ok');
const permitted=()=>until>Date.now()&&until-Date.now()<=ttl;
const supported=()=>Boolean(window.isSecureContext&&window.PublicKeyCredential&&navigator.credentials?.create&&navigator.credentials?.get);
const decode=str=>{let s=String(str).replace(/-/g,'+').replace(/_/g,'/');return Uint8Array.from(atob(s+'='.repeat((4-s.length%4)%4)),c=>c.charCodeAt(0))};
const encode=value=>{if(value==null)return null;let arr=value instanceof ArrayBuffer?new Uint8Array(value):new Uint8Array(value.buffer||value,value.byteOffset||0,value.byteLength||value.length);return btoa(String.fromCharCode(...arr)).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'')};
function parseOptions(json,create){
 const PK=window.PublicKeyCredential;
 if(create&&PK.parseCreationOptionsFromJSON)return PK.parseCreationOptionsFromJSON(json);
 if(!create&&PK.parseRequestOptionsFromJSON)return PK.parseRequestOptionsFromJSON(json);
 const result={...json,challenge:decode(json.challenge)};
 if(create){result.user={...json.user,id:decode(json.user.id)};if(json.excludeCredentials)result.excludeCredentials=json.excludeCredentials.map(x=>({...x,id:decode(x.id)}))}
 else if(json.allowCredentials)result.allowCredentials=json.allowCredentials.map(x=>({...x,id:decode(x.id)}));
 return result;
}
function credentialData(c){
 if(typeof c.toJSON==='function')return c.toJSON();
 const r=c.response;
 const out={id:c.id,rawId:encode(c.rawId),type:c.type,response:{clientDataJSON:encode(r.clientDataJSON)},clientExtensionResults:c.getClientExtensionResults?.()||{}};
 if(r.attestationObject){out.response.attestationObject=encode(r.attestationObject);out.response.transports=r.getTransports?.()||[]}
 else{out.response.authenticatorData=encode(r.authenticatorData);out.response.signature=encode(r.signature);out.response.userHandle=encode(r.userHandle)}
 return out;
}
async function request(route,operation,more={}){
 const initData=String(window.Telegram?.WebApp?.initData||'');
 const clientMode=initData?'telegram':navigator.standalone?'pwa':'browser';
 const response=await fetch('/api/partner-message?rudiAction='+route,{method:'POST',credentials:'same-origin',headers:{'Content-Type':'application/json'},body:JSON.stringify({operation,clientMode,initData,...more}),cache:'no-store'});
 const data=await response.json().catch(()=>({}));
 if(!response.ok||!data.ok)throw Error(data.error||'server-error');
 return data;
}
const pass=(operation,data)=>request('passkey',operation,data);
function finish(){until=Date.now()+ttl;try{sessionStorage.setItem(key,String(until))}catch(_){}hide()}
function hide(){root?.remove();root=null;locked=false;pending=false}
function stage(title,body){
 root.replaceChildren();
 const card=document.createElement('div');
 card.className='rudi-iphone-guard-card';
 const h=document.createElement('h2');h.textContent=title;
 const p=document.createElement('p');p.textContent=body;
 const status=document.createElement('small');
 card.append(h,p,status);root.append(card);
 return {card,status};
}
function button(parent,label,fn,secondary=false){
 const b=document.createElement('button');b.type='button';b.textContent=label;
 if(secondary)b.className='secondary';
 b.addEventListener('click',fn);parent.append(b);return b;
}
function errorText(e){return e?.name==='NotAllowedError'?'Face ID не подтверждён. Попробуй ещё раз.':'Не удалось проверить данные. Проверь соединение и повтори.'}
function askPin(seq){
 if(seq!==sequence||!root)return;
 const {card,status}=stage('Резервный PIN','PIN РуДи используется, если Face ID временно недоступен.');
 const input=document.createElement('input');input.type='password';input.inputMode='numeric';input.maxLength=6;input.placeholder='6 цифр';card.append(input);
 const submit=button(card,'Войти',async()=>{
  if(pending)return;
  const pin=input.value.trim();if(!/^\d{6}$/.test(pin)){status.textContent='Нужно 6 цифр.';return}
  pending=true;submit.disabled=true;
  try{const result=await request('browser-auth','login',{actor,pin});
   if(seq!==sequence||!root)return;
   if(result.actor!==actor)throw Error('wrong-actor');
   finish();
  }catch(_){if(seq===sequence&&root){pending=false;submit.disabled=false;status.textContent='Неверный PIN или нет соединения.'}}
 });
 button(card,'Назад',()=>{if(!pending)beginCheck()},true);input.focus();
}
async function enable(seq){
 const {card,status}=stage('Подключи Face ID','На iPhone для Рустама настройка Face ID обязательна. Пропустить нельзя.');
 if(!supported()){status.textContent='Этот браузер не поддерживает Face ID. Открой РуДи в Safari.';button(card,'Повторить',beginCheck);return}
 let prepared=null;
 const action=button(card,'Подготавливаю…',()=>{
  if(!prepared||pending)return;
  pending=true;action.disabled=true;
  let credential;
  try{credential=navigator.credentials.create({publicKey:prepared.options})}
  catch(e){pending=false;action.disabled=false;status.textContent=errorText(e);return}
  Promise.resolve(credential).then(value=>pass('register-verify',{challenge:prepared.json.challenge,response:credentialData(value)})).then(result=>{
    if(seq!==sequence||!root)return;
    if(!result.configured)throw Error('not-configured');
    finish();
  }).catch(e=>{if(seq===sequence&&root){pending=false;action.disabled=false;status.textContent=errorText(e)}});
 });
 action.disabled=true;
 try{const value=await pass('register-options');
  if(seq!==sequence||!root)return;
  prepared={json:value.publicKey,options:parseOptions(value.publicKey,true)};
  action.disabled=false;action.textContent='Включить Face ID';
 }catch(e){if(seq===sequence&&root){status.textContent=errorText(e);button(card,'Повторить',beginCheck,true)}}
}
async function unlock(seq){
 const {card,status}=stage('Подтверди вход','Для Рустама на iPhone доступ действует 10 минут.');
 let prepared=null;
 const action=button(card,'Подготавливаю…',()=>{
  if(!prepared||pending)return;
  pending=true;action.disabled=true;
  let proof;
  try{proof=navigator.credentials.get({publicKey:prepared.options})}
  catch(e){pending=false;action.disabled=false;status.textContent=errorText(e);return}
  Promise.resolve(proof).then(value=>pass('auth-verify',{challenge:prepared.json.challenge,response:credentialData(value)})).then(result=>{
   if(seq!==sequence||!root)return;
   if(result.actor!==actor)throw Error('wrong-actor');
   finish();
  }).catch(e=>{if(seq===sequence&&root){pending=false;action.disabled=false;status.textContent=errorText(e)}});
 });
 action.disabled=true;
 button(card,'Резервный вход по PIN',()=>{if(!pending)askPin(seq)},true);
 if(!supported()){status.textContent='Face ID не поддерживается в этом браузере.';return}
 try{const value=await pass('auth-options');if(seq!==sequence||!root)return;
  prepared={json:value.publicKey,options:parseOptions(value.publicKey,false)};
  action.textContent='Войти с Face ID';action.disabled=false;
 }catch(e){if(seq===sequence&&root){status.textContent=errorText(e);button(card,'Повторить',beginCheck,true)}}
}
async function beginCheck(){
 if(!root)return;
 const seq=++sequence;pending=false;
 stage('Проверяю Face ID','Подожди несколько секунд…');
 try{const state=await pass('status');if(seq!==sequence||!root)return;
  if(state.configured)await unlock(seq);else await enable(seq);
 }catch(e){if(seq===sequence&&root){const ui=stage('Проверка недоступна','Для открытия РуДи подключись к интернету.');ui.status.textContent=errorText(e);button(ui.card,'Повторить',beginCheck)}}
}
function lock(){
 if(locked)return;
 locked=true;root=document.createElement('div');root.className='rudi-iphone-guard';root.setAttribute('role','dialog');root.setAttribute('aria-modal','true');
 document.body.append(root);beginCheck();
}
function update(){if(!document.body)return;if(!eligible()){if(locked)hide();return}if(permitted()){if(locked)hide();return}lock()}
function boot(){
 const style=document.createElement('style');style.textContent='.rudi-iphone-guard{position:fixed;inset:0;z-index:2147483600;display:flex;align-items:center;justify-content:center;padding:calc(18px + env(safe-area-inset-top)) 16px calc(18px + env(safe-area-inset-bottom));box-sizing:border-box;background:#111521;color:#fff}.rudi-iphone-guard-card{width:min(390px,100%);display:grid;gap:14px;padding:24px 20px;background:#232939;border-radius:22px;box-shadow:0 16px 60px #0007}.rudi-iphone-guard-card h2{margin:0;font-size:23px}.rudi-iphone-guard-card p{margin:0;color:#c4cede;font-size:14px;line-height:1.45}.rudi-iphone-guard-card button{min-height:45px;border:0;border-radius:12px;background:#685cf2;color:#fff;font:inherit;font-weight:750}.rudi-iphone-guard-card button.secondary{background:#414859}.rudi-iphone-guard-card button:disabled{opacity:.55}.rudi-iphone-guard-card small{color:#f7b5bd;font-size:12px}.rudi-iphone-guard-card input{padding:12px;border-radius:11px;background:#121725;border:1px solid #656d83;color:#fff;font-size:18px}';document.head.append(style);
 new MutationObserver(update).observe(document.body,{attributes:true,attributeFilter:['class','data-rudi-actor']});
 document.addEventListener('visibilitychange',()=>{if(!document.hidden)update()});window.addEventListener('pageshow',update);window.setInterval(update,5000);update();
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});else boot();
})();