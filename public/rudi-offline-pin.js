/* Device-local PIN verification, available only after a successful online PIN check.
 * The six-digit PIN is never saved. The salted PBKDF2 verifier is scoped to
 * the RUDI origin and one named actor, with expiry and local retry limits.
 */
(()=>{
'use strict';
const PREFIX='rudi:offline-pin:v1:';
const VALID_MS=30*24*60*60*1000;
const ITERATIONS=420000;
const ACTORS=new Set(['Рустам','Диана']);
const textEncoder=new TextEncoder();
const key=actor=>PREFIX+actor;
const hex=bytes=>Array.from(bytes,b=>b.toString(16).padStart(2,'0')).join('');
const unhex=value=>{
  if(typeof value!=='string'||!/^[0-9a-f]+$/i.test(value)||value.length%2)return null;
  return Uint8Array.from(value.match(/.{2}/g),p=>parseInt(p,16));
};
function validRecord(actor){
  if(!ACTORS.has(actor))return null;
  try{
    const record=JSON.parse(localStorage.getItem(key(actor))||'null');
    const age=Date.now()-Number(record?.enrolledAt||0);
    if(record?.v!==1||record?.actor!==actor||record?.origin!==location.origin||
       !Number.isFinite(age)||age<0||age>=VALID_MS||
       !/^[a-f0-9]{64}$/i.test(record?.salt||'')||
       !/^[a-f0-9]{64}$/i.test(record?.verifier||''))return null;
    return record;
  }catch(_){return null}
}
async function derive(pin,salt){
  if(!/^\d{6}$/.test(String(pin||''))||!crypto?.subtle)throw new Error('offline-pin-unavailable');
  const base=await crypto.subtle.importKey('raw',textEncoder.encode(pin),'PBKDF2',false,['deriveBits']);
  const bits=await crypto.subtle.deriveBits({
    name:'PBKDF2',hash:'SHA-256',salt,iterations:ITERATIONS
  },base,256);
  return hex(new Uint8Array(bits));
}
async function enroll(actor,pin){
  if(!ACTORS.has(actor)||!/^\d{6}$/.test(String(pin||''))||
     !window.isSecureContext||!crypto?.getRandomValues||!crypto?.subtle)
    throw new Error('offline-pin-unavailable');
  const salt=crypto.getRandomValues(new Uint8Array(32));
  const verifier=await derive(pin,salt);
  const record={v:1,actor,origin:location.origin,enrolledAt:Date.now(),
    salt:hex(salt),verifier,attempts:0,lockedUntil:0};
  localStorage.setItem(key(actor),JSON.stringify(record));
  return Boolean(validRecord(actor));
}
function forget(actor){
  if(!ACTORS.has(actor))return;
  try{localStorage.removeItem(key(actor))}catch(_){}
}
function compare(left,right){
  if(left.length!==right.length)return false;
  let result=0;
  for(let i=0;i<left.length;i++)result|=left.charCodeAt(i)^right.charCodeAt(i);
  return result===0;
}
async function verify(actor,pin){
  const record=validRecord(actor);
  if(!record)throw new Error('offline-pin-not-configured');
  if(!/^\d{6}$/.test(String(pin||'')))throw new Error('offline-pin-invalid');
  const now=Date.now();
  if(Number(record.lockedUntil||0)>now)throw new Error('offline-pin-locked');
  const hash=await derive(pin,unhex(record.salt));
  if(compare(hash,record.verifier)){
    record.attempts=0;record.lockedUntil=0;
    localStorage.setItem(key(actor),JSON.stringify(record));
    return true;
  }
  record.attempts=Math.min(99,Math.max(0,Number(record.attempts||0))+1);
  record.lockedUntil=record.attempts>=12?now+3600000:
    record.attempts>=8?now+300000:
    record.attempts>=4?now+30000:0;
  localStorage.setItem(key(actor),JSON.stringify(record));
  throw new Error(record.lockedUntil?'offline-pin-locked':'offline-pin-invalid');
}
const isOffline=()=>navigator.onLine===false||document.body?.dataset.offlineMode==='1';
window.rudiOfflinePin=Object.freeze({enroll,verify,forget,has:actor=>Boolean(validRecord(actor)),isOffline});
})();