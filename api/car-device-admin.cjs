'use strict';
const crypto=require('node:crypto');
const {promisify}=require('node:util');
const scrypt=promisify(crypto.scrypt);
const NS='rudi-car-admin-v1',TTL=15*60;
const hash=value=>crypto.createHash('sha256').update(value).digest('hex');
const fail=message=>{throw new Error(message);};
function createCarAdminService({client,now=Date.now,env=process.env}){
  const read=async key=>(await client.getRecord(NS,key))?.value??null;
  async function credentials(){
    const saved=await read('credentials');if(saved)return saved;
    const match=String(env.UNI_V_ADMIN_PASSWORD_HASH||'').match(/^scrypt:([a-f0-9]{48}):([a-f0-9]{64})$/);
    return match?{salt:match[1],digest:match[2],epoch:hash('env:'+match[0])}:null;
  }
  async function status(){return {configured:Boolean(await credentials())};}
  async function setPassword(password){
    if(typeof password!=='string'||password.length<8||password.length>128||!password.trim())fail('car-admin-password-format');
    const salt=crypto.randomBytes(24).toString('hex');
    const digest=(await scrypt(password,salt,32)).toString('hex');
    await client.set(NS,'credentials',{salt,digest,epoch:crypto.randomBytes(24).toString('hex')});
    return {configured:true};
  }
  function validId(id){return typeof id==='string'&&/^[A-Za-z0-9_-]{20,128}$/.test(id);}
  async function budget(key,limit){
    const bucket=Math.floor(Number(now())/(TTL*1000));
    for(let slot=0;slot<limit;slot++)if(await client.setIfAbsent(NS,'attempt:'+key+':'+bucket+':'+slot,{used:true},{ttl:TTL*2}))return;
    fail('car-admin-rate-limited');
  }
  async function login(password,deviceId){
    if(!validId(deviceId)||typeof password!=='string'||password.length>128)fail('car-admin-invalid');
    const creds=await credentials();
    if(!creds)fail('car-admin-not-configured');
    await budget(creds.epoch+':device:'+hash(deviceId),5);
    await budget(creds.epoch+':global',30);
    const actual=await scrypt(password,creds.salt,32),expected=Buffer.from(creds.digest,'hex');
    if(expected.length!==actual.length||!crypto.timingSafeEqual(expected,actual))fail('car-admin-invalid');
    const adminToken=crypto.randomBytes(32).toString('base64url'),expiresAt=Number(now())+TTL*1000;
    await client.set(NS,'session:'+hash(adminToken),{epoch:creds.epoch,device:hash(deviceId),expiresAt},{ttl:TTL});
    return {ok:true,adminToken,expiresAt};
  }
  async function authorize(token,deviceId){
    if(typeof token!=='string'||!/^[A-Za-z0-9_-]{43}$/.test(token)||!validId(deviceId))fail('car-admin-unauthorized');
    const [session,creds]=await Promise.all([read('session:'+hash(token)),credentials()]);
    if(!session||!creds||session.epoch!==creds.epoch||session.device!==hash(deviceId)||session.expiresAt<=Number(now()))fail('car-admin-unauthorized');
  }
  return {status,setPassword,login,authorize};
}
module.exports={createCarAdminService};
