'use strict';

// Uniswap V3 positions are ERC-721 NFTs on Ethereum mainnet.
// Read onchain so balances work even when a third-party Graph API is unavailable.
const NFT_MANAGER='0xC36442b4a4522E871399CD717aBDD847Ab11FE88';
const FACTORY='0x1F98431c8aD98523631AE4a59f267346ea31F984';
const TOKENS={
  '0xdac17f958d2ee523a2206206994597c13d831ec7':{symbol:'USDT',decimals:6,stable:true},
  '0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48':{symbol:'USDC',decimals:6,stable:true},
  '0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2':{symbol:'WETH',decimals:18,eth:true},
  '0x6b175474e89094c44da98b954eedeac495271d0f':{symbol:'DAI',decimals:18,stable:true},
};
function word(value){return BigInt(value).toString(16).padStart(64,'0')}
function addressWord(value){return String(value).toLowerCase().replace(/^0x/,'').padStart(64,'0')}
function decodeWords(hex) {
  const content=String(hex||'').replace(/^0x/,'');
  if(!content||content.length%64!==0||!/^[0-9a-f]+$/i.test(content))throw new Error('crypto-uniswap-rpc-invalid');
  return content.match(/.{64}/g)||[];
}
function addr(value){return '0x'+value.slice(-40).toLowerCase()}
function positionAmounts(rawLiquidity,tickLower,tickUpper,sqrtPrice) {
  const L=Number(rawLiquidity);
  const sqrt=Number(sqrtPrice)/2**96;
  const lower=Math.pow(1.0001,tickLower/2),upper=Math.pow(1.0001,tickUpper/2);
  if(![L,sqrt,lower,upper].every(Number.isFinite)||sqrt<=0||lower<=0||lower>=upper||L<0)
    throw new Error('crypto-uniswap-position-math-invalid');
  if(sqrt<=lower)return {raw0:L*(upper-lower)/(upper*lower),raw1:0};
  if(sqrt>=upper)return {raw0:0,raw1:L*(upper-lower)};
  return {raw0:L*(upper-sqrt)/(upper*sqrt),raw1:L*(sqrt-lower)};
}
function tokenUSD(token,price){
  if(token?.stable)return 1;
  if(token?.eth&&Number(price?.usd)>0)return Number(price.usd);
  return null;
}
async function readV3Positions(address,price,call,options={}) {
  if(!/^0x[0-9a-fA-F]{40}$/.test(String(address)))throw new Error('crypto-address-invalid');
  if(typeof call!=='function')throw new Error('crypto-uniswap-rpc-required');
  const countRaw=decodeWords(await call(NFT_MANAGER,'0x70a08231'+addressWord(address)));
  const nftCount=Number(BigInt('0x'+countRaw[0]));
  const cap=Math.max(0,Math.min(15,Number(options.maxPositions)||12));
  const ids=await Promise.all(Array.from({length:Math.min(nftCount,cap)},(_,i)=>
    call(NFT_MANAGER,'0x2f745c59'+addressWord(address)+word(i)).then(res=>BigInt('0x'+decodeWords(res)[0]).toString())));
  const positions=await Promise.all(ids.map(async id=>{
    const raw=decodeWords(await call(NFT_MANAGER,'0x99fbab88'+word(id)));
    if(raw.length<12)throw new Error('crypto-uniswap-position-invalid');
    const token0=addr(raw[2]),token1=addr(raw[3]);
    const fee=Number(BigInt('0x'+raw[4]));
    const tickLower=Number(BigInt.asIntN(24,BigInt('0x'+raw[5])));
    const tickUpper=Number(BigInt.asIntN(24,BigInt('0x'+raw[6])));
    const liquidity=BigInt('0x'+raw[7]);
    if(liquidity===0n)return null;
    const poolResult=decodeWords(await call(FACTORY,'0x1698ee82'+addressWord(token0)+addressWord(token1)+word(fee)));
    const pool=addr(poolResult[0]);
    if(/^0x0{40}$/.test(pool))throw new Error('crypto-uniswap-pool-missing');
    const slot=decodeWords(await call(pool,'0x3850c7bd'));
    const sqrtPrice=BigInt('0x'+slot[0]);
    const currentTick=Number(BigInt.asIntN(24,BigInt('0x'+slot[1])));
    const symbol0=TOKENS[token0]?.symbol||token0.slice(0,8)+'…';
    const symbol1=TOKENS[token1]?.symbol||token1.slice(0,8)+'…';
    const decimals0=TOKENS[token0]?.decimals,decimals1=TOKENS[token1]?.decimals;
    const amounts=positionAmounts(liquidity,tickLower,tickUpper,sqrtPrice);
    const amount0=decimals0===undefined?null:amounts.raw0/10**decimals0;
    const amount1=decimals1===undefined?null:amounts.raw1/10**decimals1;
    const usd0=tokenUSD(TOKENS[token0],price),usd1=tokenUSD(TOKENS[token1],price);
    const valueUsd=amount0!==null&&amount1!==null&&usd0!==null&&usd1!==null
      ?Math.round((amount0*usd0+amount1*usd1)*100)/100:null;
    const owed0=decimals0!==undefined?Number(BigInt('0x'+raw[10]))/10**decimals0:null;
    const owed1=decimals1!==undefined?Number(BigInt('0x'+raw[11]))/10**decimals1:null;
    return {id,pair:symbol0+'/'+symbol1,feeTier:fee,liquidity:liquidity.toString(),
      tickLower,tickUpper,currentTick,inRange:currentTick>=tickLower&&currentTick<tickUpper,
      amount0,amount1,token0:symbol0,token1:symbol1,valueUsd,
      owed0,owed1};
  }));
  return {positions:positions.filter(Boolean),count:nftCount,partial:nftCount>cap};
}
module.exports={readV3Positions,positionAmounts,NFT_MANAGER,FACTORY};
