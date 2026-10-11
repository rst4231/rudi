'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const lp=require('../api/uniswap-lp.cjs');
const OWNER='0x'+'a'.repeat(40);
const WETH='0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2';
const USDT='0xdac17f958d2ee523a2206206994597c13d831ec7';
const USDC='0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48';
const POOL='0x'+'b'.repeat(40);
const Q96=1n<<96n, Q128=1n<<128n;
const encode=(...values)=>BigInt('0x'+values.map(v=>BigInt.asUintN(256,BigInt(v)).toString(16).padStart(64,'0')).join(''));
const callSelector=hex=>hex.slice(0,10);
const prices={ETH:3000,WETH:3000,USDT:1,USDC:1};
const ownerAsInt=BigInt(OWNER);

test('keccak and selectors use Ethereum Keccak-256, not SHA3-256',()=>{
  assert.equal(lp.keccak256('0x'),'0xc5d2460186f7233c927e7db2dcc703c0e500b653ca82273b7bfad8045d85a470');
  assert.equal(lp.selector('positions(uint256)'),'0x99fbab88');
  assert.equal(lp.selector('collect((uint256,address,uint128,uint128))'),'0xfc6f7865');
});

test('liquidity math handles below, inside and above the price range',()=>{
  const low=-600,high=600,L=100000000n;
  const below=lp.liquidityAmounts(L,lp.sqrtTick(-900),low,high);
  const inside=lp.liquidityAmounts(L,lp.sqrtTick(0),low,high);
  const above=lp.liquidityAmounts(L,lp.sqrtTick(900),low,high);
  assert.ok(below[0]>0n);assert.equal(below[1],0n);
  assert.ok(inside[0]>0n);assert.ok(inside[1]>0n);
  assert.equal(above[0],0n);assert.ok(above[1]>0n);
  assert.equal(lp.sqrtTick(0),Q96);
  assert.equal(lp.sqrtTick(-887272),4295128739n);
  assert.equal(lp.sqrtTick(887272),1461446703485210103287273052203988822378723970342n);
});

test('v3 NFT is discovered, liquidity and claimable amounts counted separately',async()=>{
  const visited=[];
  const rpc=async(method,[tx])=>{
    assert.equal(method,'eth_call');visited.push(tx);
    const sig=callSelector(tx.data),to=tx.to.toLowerCase();
    if(sig===lp.selector('balanceOf(address)'))return BigInt(to===lp.V3?1:0);
    if(sig===lp.selector('tokenOfOwnerByIndex(address,uint256)'))return 12n;
    if(sig===lp.selector('ownerOf(uint256)'))return ownerAsInt;
    if(sig===lp.selector('positions(uint256)'))return encode(0n,0n,BigInt(WETH),BigInt(USDC),3000n,-600n,600n,100000000n,0n,0n,0n,0n);
    if(sig===lp.selector('getPool(address,address,uint24)'))return BigInt(POOL);
    if(sig===lp.selector('slot0()'))return encode(Q96,0,0,0,0,0,0);
    if(sig===lp.selector('feeGrowthGlobal0X128()'))return Q128*1000000000000n/100000000n;
    if(sig===lp.selector('feeGrowthGlobal1X128()'))return Q128*2000000n/100000000n;
    if(sig===lp.selector('ticks(int24)'))return encode(0,0,0,0,0,0,0,0);
    throw new Error('unexpected '+sig);
  };
  const result=await lp.readLpPositions(OWNER,prices,{rpc});
  assert.equal(result.positions.length,1);
  const p=result.positions[0];assert.equal(p.version,'v3');assert.equal(p.tokenId,'12');
  assert.equal(p.inRange,true);assert.ok(p.liquidityUsd>0);
  assert.ok(Math.abs(p.feesUsd-2.003)<0.001);
  assert.equal(result.liquidityUsd,p.liquidityUsd);assert.equal(result.feesUsd,p.feesUsd);
  assert.equal(visited.filter(x=>x.data.startsWith('0xfc6f7865')).length,0);
  assert.equal(visited.filter(x=>x.data.startsWith(lp.selector('ticks(int24)'))).length,2);
  assert.equal(visited.some(x=>x.to?.toLowerCase()===lp.V3&&x.data.startsWith('0x')),true);
});

test('v4 NFT derives pool key, reads fee growth and counts unclaimed amounts',async()=>{
  const packed=(((-60n)&0xffffffn)<<8n)|(((60n)&0xffffffn)<<32n);
  const L=100000000n;
  const feeGrowthUSDT=Q128*1000000n/L;
  const rpc=async(method,[tx])=>{
    assert.equal(method,'eth_call');
    const sig=callSelector(tx.data),to=tx.to.toLowerCase();
    if(sig===lp.selector('balanceOf(address)'))return BigInt(to===lp.V4?1:0);
    if(sig===lp.selector('ownerOf(uint256)'))return ownerAsInt;
    if(sig===lp.selector('getPoolAndPositionInfo(uint256)'))return encode(BigInt(WETH),BigInt(USDT),500n,10n,0n,packed);
    if(sig===lp.selector('getSlot0(bytes32)'))return encode(Q96,0,0,500);
    if(sig===lp.selector('getPositionLiquidity(uint256)'))return L;
    if(sig===lp.selector('getPositionInfo(bytes32,address,int24,int24,bytes32)'))return encode(L,0n,0n);
    if(sig===lp.selector('getFeeGrowthInside(bytes32,int24,int24)'))return encode(0,feeGrowthUSDT);
    throw new Error('unknown v4 selector '+sig);
  };
  const result=await lp.readLpPositions(OWNER,prices,{rpc,options:{v4IdsForTests:['42']}});
  const p=result.positions[0];assert.equal(result.positions.length,1);
  assert.equal(p.version,'v4');assert.equal(p.pair,'WETH/USDT');assert.ok(p.liquidityUsd>0);
  assert.ok(p.feesUsd>0.99&&p.feesUsd<=1.01);
  assert.equal(p.claimableIncludesPrincipal,false);
});

test('Arbitrum owner has three v3 WETH/USDC pools with claimable fees',async()=>{
  const ids=[5212362n,5212363n,5212364n];
  const positionsAsked=[];
  const rpc=async(method,[tx])=>{
    assert.equal(method,'eth_call');
    const sig=callSelector(tx.data),to=tx.to.toLowerCase();
    if(sig===lp.selector('balanceOf(address)'))return BigInt(to===lp.V3?3:0);
    if(sig===lp.selector('tokenOfOwnerByIndex(address,uint256)'))return ids[Number(BigInt('0x'+tx.data.slice(-64)))];
    if(sig===lp.selector('ownerOf(uint256)'))return ownerAsInt;
    if(sig===lp.selector('positions(uint256)')){
      const id=BigInt('0x'+tx.data.slice(-64));positionsAsked.push(id);
      return encode(0,0,BigInt(WETH),0xaf88d065e77c8cc2239327c5edb3a432268e5831n,500,-600,600,100000000,0,0,0,0);
    }
    if(sig===lp.selector('getPool(address,address,uint24)'))return BigInt(POOL);
    if(sig===lp.selector('slot0()'))return encode(Q96,0,0,0,0,0,0);
    if(sig===lp.selector('feeGrowthGlobal0X128()'))return Q128*1000000000000n/100000000n;
    if(sig===lp.selector('feeGrowthGlobal1X128()'))return Q128*2000000n/100000000n;
    if(sig===lp.selector('ticks(int24)'))return encode(0,0,0,0,0,0,0,0);
    throw new Error('unexpected '+sig+' '+to);
  };
  const result=await lp.readLpPositions(OWNER,prices,{rpc,options:{chain:'arbitrum'}});
  assert.deepEqual(positionsAsked,ids);
  assert.equal(result.positions.length,3);
  assert.ok(result.positions.every(p=>p.pair==='WETH/USDC'&&p.inRange));
  assert.ok(result.positions.every(p=>p.feesUsd>2));
  assert.ok(result.liquidityUsd>0&&result.feesUsd>6);
});

test('unknown LP token fails closed instead of valuing missing capital at zero',async()=>{
  const badToken='0x'+'f'.repeat(40);
  const rpc=async(method,[tx])=>{
    const sig=callSelector(tx.data),to=tx.to.toLowerCase();
    if(sig===lp.selector('balanceOf(address)'))return BigInt(to===lp.V3?1:0);
    if(sig===lp.selector('tokenOfOwnerByIndex(address,uint256)'))return 8n;
    if(sig===lp.selector('ownerOf(uint256)'))return ownerAsInt;
    if(sig===lp.selector('positions(uint256)'))return encode(0,0,BigInt(badToken),BigInt(USDC),3000,-600,600,100000000,0,0,0,0);
    throw new Error('unexpected '+sig);
  };
  await assert.rejects(()=>lp.readLpPositions(OWNER,prices,{rpc}),/crypto-lp-unsupported-token/);
});

test('v4 requires complete indexer discovery and never assumes zero NFTs',async()=>{
  const rpc=async(method,[tx])=>{
    const sig=callSelector(tx.data),to=tx.to.toLowerCase();
    if(sig===lp.selector('balanceOf(address)'))return BigInt(to===lp.V4?1:0);
    throw new Error('unexpected '+sig);
  };
  const fetchImpl=async()=>({ok:true,json:async()=>({items:[],next_page_params:null})});
  await assert.rejects(()=>lp.readLpPositions(OWNER,prices,{rpc,options:{fetchImpl}}),/crypto-lp-discovery-incomplete/);
});
