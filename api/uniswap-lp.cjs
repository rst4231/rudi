'use strict';
// All RPC operations in this module are eth_call only. Never sends transactions.
const V3 = '0xc36442b4a4522e871399cd717abdd847ab11fe88';
const V4 = '0xbd216513d74c8cf14cf4747e6aaa6420ff64ee9e';
const V3_FACTORY = '0x1f98431c8ad98523631ae4a59f267346ea31f984';
const STATE_VIEW = '0x7ffe42c4a5deea5b0fec41c94c136cf115597227';
const ZERO = '0x0000000000000000000000000000000000000000';
const Q96 = 1n << 96n, Q128 = 1n << 128n, MASK_256 = (1n << 256n) - 1n;
const LIMIT = 30;
const SUPPORTED = new Map([
  [ZERO, { symbol:'ETH', decimals:18 }],
  ['0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2',{symbol:'WETH',decimals:18}],
  ['0xdac17f958d2ee523a2206206994597c13d831ec7',{symbol:'USDT',decimals:6}],
  ['0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48',{symbol:'USDC',decimals:6}],
]);
const RC = [
  '0000000000000001','0000000000008082','800000000000808a','8000000080008000',
  '000000000000808b','0000000080000001','8000000080008081','8000000000008009',
  '000000000000008a','0000000000000088','0000000080008009','000000008000000a',
  '000000008000808b','800000000000008b','8000000000008089','8000000000008003',
  '8000000000008002','8000000000000080','000000000000800a','800000008000000a',
  '8000000080008081','8000000000008080','0000000080000001','8000000080008008'
].map(x=>BigInt('0x'+x));
const ROT = [
 [0,36,3,41,18],[1,44,10,45,2],[62,6,43,15,61],[28,55,25,21,56],[27,20,39,8,14]
];
function keccak256(data) {
  const bytes=typeof data==='string'?Buffer.from(data.replace(/^0x/,''),'hex'):Buffer.from(data);
  const msg=Array.from(bytes);msg.push(1);while(msg.length%136!==135)msg.push(0);msg.push(128);
  const lanes=Array(25).fill(0n);const mask=(1n<<64n)-1n;
  const rol=(a,n)=>n===0?a:((a<<BigInt(n))|(a>>BigInt(64-n)))&mask;
  for(let offset=0;offset<msg.length;offset+=136) {
    for(let i=0;i<136;i++)lanes[Math.floor(i/8)]^=BigInt(msg[offset+i])<<BigInt((i%8)*8);
    for(const round of RC) {
      const C=Array.from({length:5},(_,x)=>Array.from({length:5},(_,y)=>lanes[x+5*y]).reduce((a,b)=>a^b,0n));
      const D=C.map((_,x)=>C[(x+4)%5]^rol(C[(x+1)%5],1));
      for(let x=0;x<5;x++)for(let y=0;y<5;y++)lanes[x+5*y]^=D[x];
      const B=Array(25).fill(0n);
      for(let x=0;x<5;x++)for(let y=0;y<5;y++)B[y+5*((2*x+3*y)%5)]=rol(lanes[x+5*y],ROT[x][y]);
      for(let x=0;x<5;x++)for(let y=0;y<5;y++)lanes[x+5*y]=B[x+5*y]^((~B[(x+1)%5+5*y])&B[(x+2)%5+5*y]);
      lanes[0]^=round;
    }
  }
  const output=Buffer.alloc(32);for(let i=0;i<32;i++)output[i]=Number((lanes[Math.floor(i/8)]>>BigInt((i%8)*8))&255n);
  return '0x'+output.toString('hex');
}
function selector(signature){return keccak256(Buffer.from(signature)).slice(0,10);}
function word(value){return BigInt.asUintN(256,BigInt(value)).toString(16).padStart(64,'0');}
function addr(address){if(!/^0x[a-fA-F0-9]{40}$/.test(address))throw new Error('crypto-lp-address-invalid');return address.toLowerCase();}
function addressWord(address){return addr(address).slice(2).padStart(64,'0');}
function signed(v,bits){const mod=1n<<BigInt(bits),raw=BigInt(v)&(mod-1n);return raw>=mod/2n?raw-mod:raw;}
function hexWords(value,count){return BigInt(value).toString(16).padStart(count*64,'0').match(/.{64}/g).map(s=>BigInt('0x'+s));}
function hexAddress(value){return '0x'+BigInt(value).toString(16).padStart(40,'0').slice(-40);}
function sqrtTick(tick) {
  const n=Number(tick);if(!Number.isInteger(n)||Math.abs(n)>887272)throw new Error('crypto-lp-tick-invalid');
  let a=Math.abs(n),ratio=(a&1)?0xfffcb933bd6fad37aa2d162d1a594001n:0x100000000000000000000000000000000n;
  const mul=[
    0xfff97272373d413259a46990580e213an,0xfff2e50f5f656932ef12357cf3c7fdccn,
    0xffe5caca7e10e4e61c3624eaa0941cd0n,0xffcb9843d60f6159c9db58835c926644n,
    0xff973b41fa98c081472e6896dfb254c0n,0xff2ea16466c96a3843ec78b326b52861n,
    0xfe5dee046a99a2a811c461f1969c3053n,0xfcbe86c7900a88aedcffc83b479aa3a4n,
    0xf987a7253ac413176f2b074cf7815e54n,0xf3392b0822b70005940c7a398e4b70f3n,
    0xe7159475a2c29b7443b29c7fa6e889d9n,0xd097f3bdfd2022b8845ad8f792aa5825n,
    0xa9f746462d870fdf8a65dc1f90e061e5n,0x70d869a156d2a1b890bb3df62baf32f7n,
    0x31be135f97d08fd981231505542fcfa6n,0x9aa508b5b7a84e1c677de54f3e99bcn,
    0x5d6af8dedb81196699c329225ee604n,0x2216e584f5fa1ea926041bedfe98n,0x48a170391f7dc42444e8fa2n,
  ];
  for(let i=0;i<mul.length;i++)if(a & (1<<(i+1)))ratio=(ratio*mul[i])>>128n;
  if(n>0)ratio=MASK_256/ratio;
  return (ratio>>32n)+(ratio% (1n<<32n)===0n?0n:1n);
}
function liquidityAmounts(liquidity,sqrtCurrent,lower,upper) {
  const L=BigInt(liquidity),A=sqrtTick(lower),B=sqrtTick(upper),P=BigInt(sqrtCurrent);
  if(lower>=upper||P===0n)throw new Error('crypto-lp-pool-invalid');
  if(P<=A)return [L*(B-A)*Q96/B/A,0n];
  if(P>=B)return [0n,L*(B-A)/Q96];
  return [L*(B-P)*Q96/B/P,L*(P-A)/Q96];
}
function decimal(raw,decimals){const q=10n**BigInt(decimals);return Number(raw/q)+Number(raw%q)/Number(q);}
function val(raw,tok,prices) {
  const price=prices[tok.symbol];
  if(!(price>0) || !Number.isFinite(price))throw new Error('crypto-lp-price-incomplete');
  const n=decimal(raw,tok.decimals);
  if(!Number.isFinite(n)||n<0||n>1e12)throw new Error('crypto-lp-amount-invalid');
  return n*price;
}
function tokenMeta(address){const t=SUPPORTED.get(address.toLowerCase());if(!t)throw new Error('crypto-lp-unsupported-token');return t;}
function checkLimit(n){if(n>LIMIT)throw new Error('crypto-lp-too-many');return n;}
async function call(to,signature,values,ctx,extra={}) {
  const data=selector(signature)+values.map(word).join('');
  return ctx.rpc('eth_call',[{to,data,...extra},'latest'],ctx.options);
}
async function ownedCount(contract,owner,ctx) {
  const n=await call(contract,'balanceOf(address)',[BigInt(owner)],ctx);
  return checkLimit(Number(n));
}
async function listV3(owner,ctx) {
  const count=await ownedCount(V3,owner,ctx),ids=[];
  for(let i=0;i<count;i++)ids.push((await call(V3,'tokenOfOwnerByIndex(address,uint256)',[BigInt(owner),BigInt(i)],ctx)).toString());
  return ids;
}
async function listV4(owner,ctx) {
  const count=await ownedCount(V4,owner,ctx);if(!count)return [];
  if(ctx.options.v4IdsForTests) return ctx.options.v4IdsForTests.map(String);
  // v4 ERC-721 is NOT enumerable. Blockscout supplies token IDs; validate
  // ownerOf onchain before accepting any position from an indexer.
  const endpoint='https://eth.blockscout.com/api/v2/addresses/'+owner+'/nft?type=ERC-721';
  const ids=new Set();let next=null;
  for(let page=0;page<12;page++) {
    const url=new URL(endpoint);
    if(next)for(const [k,v] of Object.entries(next))if(v!==null)url.searchParams.set(k,String(v));
    let response;
    try {response=await (ctx.options.fetchImpl||fetch)(url.toString(),{cache:'no-store',signal:AbortSignal.timeout(8000)});}
    catch(_){throw new Error('crypto-lp-discovery-unavailable');}
    if(!response.ok)throw new Error('crypto-lp-discovery-unavailable');
    let data;try{data=await response.json()}catch(_){throw new Error('crypto-lp-discovery-unavailable')}
    if(!Array.isArray(data?.items))throw new Error('crypto-lp-discovery-unavailable');
    for(const item of data.items) {
      const contract=String(item.token?.address_hash||item.token?.address||'').toLowerCase();
      if(contract!==V4)continue;
      const id=String(item.id||item.token_id||'');
      if(!/^\d+$/.test(id))throw new Error('crypto-lp-discovery-unavailable');
      ids.add(id);
    }
    next=data.next_page_params;
    if(!next)break;
    if(page===11)throw new Error('crypto-lp-discovery-incomplete');
  }
  if(ids.size!==count)throw new Error('crypto-lp-discovery-incomplete');
  checkLimit(ids.size);
  return [...ids];
}
async function verifyOwner(manager,id,owner,ctx) {
  const got=hexAddress(await call(manager,'ownerOf(uint256)',[BigInt(id)],ctx));
  if(got!==owner.toLowerCase())throw new Error('crypto-lp-ownership-changed');
}
async function poolSlot0(pool,ctx){
  const raw=await call(pool,'slot0()',[],ctx);
  return hexWords(raw,7)[0];
}
async function snapshotV3(owner,id,prices,ctx) {
  await verifyOwner(V3,id,owner,ctx);
  const pos=hexWords(await call(V3,'positions(uint256)',[BigInt(id)],ctx),12);
  const token0=hexAddress(pos[2]),token1=hexAddress(pos[3]);
  const fee=Number(pos[4]),low=Number(signed(pos[5],24)),high=Number(signed(pos[6],24));
  const L=pos[7],owed0=pos[10],owed1=pos[11];
  const t0=tokenMeta(token0),t1=tokenMeta(token1);
  const poolAddress=hexAddress(await call(V3_FACTORY,'getPool(address,address,uint24)',[BigInt(token0),BigInt(token1),BigInt(fee)],ctx));
  if(poolAddress===ZERO)throw new Error('crypto-lp-pool-invalid');
  const sqrt=await poolSlot0(poolAddress,ctx);
  const [amount0,amount1]=liquidityAmounts(L,sqrt,low,high);
  // A simulated eth_call of collect calculates outstanding fees including
  // growth since last touch; this transaction is NEVER broadcast.
  // tokensOwed may also contain previously withdrawn principal, so label
  // returned amounts "claimable" rather than guaranteed pure trading fees.
  const claim=await call(V3,'collect((uint256,address,uint128,uint128))',
    [BigInt(id),BigInt(owner),(1n<<128n)-1n,(1n<<128n)-1n],ctx,{from:owner,gas:'0x989680'});
  const [claim0,claim1]=hexWords(claim,2);
  if(claim0<owed0||claim1<owed1)throw new Error('crypto-lp-fee-incomplete');
  const liquidityUsd=val(amount0,t0,prices)+val(amount1,t1,prices);
  const feesUsd=val(claim0,t0,prices)+val(claim1,t1,prices);
  return {version:'v3',tokenId:id,pair:t0.symbol+'/'+t1.symbol,feeTier:fee/1e4,
    range:[low,high],inRange:sqrt>sqrtTick(low)&&sqrt<sqrtTick(high),
    liquidityUsd,feesUsd,claimableIncludesPrincipal:owed0>0n||owed1>0n,
    liquidity:[{symbol:t0.symbol,amount:decimal(amount0,t0.decimals)},{symbol:t1.symbol,amount:decimal(amount1,t1.decimals)}],
    fees:[{symbol:t0.symbol,amount:decimal(claim0,t0.decimals)},{symbol:t1.symbol,amount:decimal(claim1,t1.decimals)}]};
}
async function snapshotV4(owner,id,prices,ctx) {
  await verifyOwner(V4,id,owner,ctx);
  const key=hexWords(await call(V4,'getPoolAndPositionInfo(uint256)',[BigInt(id)],ctx),6);
  const [token0,token1,fee,tickSpacing,hooks,info]=key;
  const t0=tokenMeta(hexAddress(token0)),t1=tokenMeta(hexAddress(token1));
  const lower=Number(signed((info>>8n)&0xffffffn,24)),upper=Number(signed((info>>32n)&0xffffffn,24));
  const poolId=keccak256('0x'+[token0,token1,fee,tickSpacing,hooks].map(word).join(''));
  const slot=hexWords(await call(STATE_VIEW,'getSlot0(bytes32)',[BigInt(poolId)],ctx),4);
  const L=await call(V4,'getPositionLiquidity(uint256)',[BigInt(id)],ctx);
  const [amount0,amount1]=liquidityAmounts(L,slot[0],lower,upper);
  const saved=hexWords(await call(STATE_VIEW,'getPositionInfo(bytes32,address,int24,int24,bytes32)',
    [BigInt(poolId),BigInt(V4),BigInt(lower),BigInt(upper),BigInt(id)],ctx),3);
  const current=hexWords(await call(STATE_VIEW,'getFeeGrowthInside(bytes32,int24,int24)',
    [BigInt(poolId),BigInt(lower),BigInt(upper)],ctx),2);
  if(saved[0]!==L)throw new Error('crypto-lp-position-inconsistent');
  const owed0=((current[0]-saved[1]+(1n<<256n))&MASK_256)*L/Q128;
  const owed1=((current[1]-saved[2]+(1n<<256n))&MASK_256)*L/Q128;
  const liquidityUsd=val(amount0,t0,prices)+val(amount1,t1,prices);
  const feesUsd=val(owed0,t0,prices)+val(owed1,t1,prices);
  return {version:'v4',tokenId:id,pair:t0.symbol+'/'+t1.symbol,feeTier:Number(fee)/1e4,
    range:[lower,upper],inRange:slot[0]>sqrtTick(lower)&&slot[0]<sqrtTick(upper),
    liquidityUsd,feesUsd,claimableIncludesPrincipal:false,
    liquidity:[{symbol:t0.symbol,amount:decimal(amount0,t0.decimals)},{symbol:t1.symbol,amount:decimal(amount1,t1.decimals)}],
    fees:[{symbol:t0.symbol,amount:decimal(owed0,t0.decimals)},{symbol:t1.symbol,amount:decimal(owed1,t1.decimals)}]};
}
async function readLpPositions(owner,prices,{rpc,options={}}) {
  const ctx={rpc,options};const safe=addr(owner);
  const [idsV3,idsV4]=await Promise.all([listV3(safe,ctx),listV4(safe,ctx)]);
  if(idsV3.length+idsV4.length>LIMIT)throw new Error('crypto-lp-too-many');
  const positions=[];
  for(const id of idsV3)positions.push(await snapshotV3(safe,id,prices,ctx));
  for(const id of idsV4)positions.push(await snapshotV4(safe,id,prices,ctx));
  const liquidityUsd=positions.reduce((s,p)=>s+p.liquidityUsd,0),feesUsd=positions.reduce((s,p)=>s+p.feesUsd,0);
  if(!Number.isFinite(liquidityUsd+feesUsd)||liquidityUsd+feesUsd>1e12)throw new Error('crypto-lp-amount-invalid');
  return { positions,liquidityUsd,feesUsd };
}
module.exports={V3,V4,STATE_VIEW,selector,keccak256,sqrtTick,liquidityAmounts,readLpPositions,snapshotV3,snapshotV4};
