/* RUDI wallet brand matching, independent of financial balances and D1. */
(function(root){
  'use strict';
  // Domains are fixed, never constructed from a user's wallet name.
  // IDs deliberately fit into the existing 12-character wallet.icon field (b:<id>).
  const BANKS=[
    ['sber','Сбер','sberbank.ru','сбер,сбербанк,sber,sberbank,sber bank'],
    ['alfa','Альфа-Банк','alfabank.ru','альфа,альфа банк,альфабанк,alfa,alpha bank,alfabank'],
    ['tbank','Т-Банк','tbank.ru','т банк,тбанк,тинькофф,тинькоф,t bank,tbank,tinkoff,tnf,тнф'],
    ['vtb','ВТБ','vtb.ru','втб,втб24,vtb,vtb24'],
    ['ozon','Ozon Банк','ozon.ru','ozon,озон,ozon bank,озон банк,озонбанк'],
    ['raiff','Райффайзенбанк','raiffeisen.ru','райффайзен,райф,райффайзенбанк,raiffeisen,raiffeisenbank,raiff'],
    ['gazprom','Газпромбанк','gazprombank.ru','газпромбанк,газпром банк,gazprombank'],
    ['psb','ПСБ','psbank.ru','псб,промсвязьбанк,psb,psbank'],
    ['sovcom','Совкомбанк','sovcombank.ru','совкомбанк,халва,sovcombank'],
    ['mkb','МКБ','mkb.ru','мкб,московский кредитный банк,mkb'],
    ['rosbank','Росбанк','rosbank.ru','росбанк,rosbank'],
    ['uralsib','Уралсиб','uralsib.ru','уралсиб,uralsib'],
    ['otp','ОТП Банк','otpbank.ru','отп,отп банк,otp bank,otpbank'],
    ['rshb','Россельхозбанк','rshb.ru','россельхозбанк,рсхб,rshb'],
    ['akbars','Ак Барс Банк','akbars.ru','ак барс,акбарс,ak bars,akbars'],
    ['pochta','Почта Банк','pochtabank.ru','почта банк,почтабанк,pochta bank,pochtabank'],
    ['open','Банк Открытие','open.ru','банк открытие,открытие банк,открытие,open bank'],
    ['home','Хоум Банк','homecredit.ru','хоум банк,хоум кредит,home credit,homecredit'],
    ['tochka','Точка','tochka.com','банк точка,точка банк,точка,tochka'],
    ['modul','Модульбанк','modulbank.ru','модульбанк,modulbank'],
    ['yabank','Яндекс Пэй','pay.yandex.ru','яндекс пэй,яндекс банк,yandex pay,yandex bank'],
    ['wb','Wildberries','wildberries.ru','wildberries,вайлдберриз,wildberries банк,вб банк'],
    ['unicredit','ЮниКредит','unicreditbank.ru','юникредит,unicredit'],
    ['absolut','Абсолют Банк','absolutbank.ru','абсолют банк,абсолютбанк,absolutbank'],
    ['rencredit','Ренессанс Банк','rencredit.ru','ренессанс банк,ренессанс кредит,rencredit'],
    ['bspb','Банк Санкт-Петербург','bspb.ru','банк санкт петербург,бспб,bspb'],
    ['avangard','Авангард','avangard.ru','банк авангард,авангард,avangard'],
    ['sinara','Синара','sinara.ru','банк синара,синара,sinara'],
    ['mts','МТС Банк','mtsbank.ru','мтс банк,мтсбанк,mts bank,mtsbank'],
    ['urals','УБРиР','ubrr.ru','убрир,убрир банк,ubrr'],
    ['fora','Фора-Банк','forabank.ru','фора банк,форабанк,forabank'],
    ['rncb','РНКБ','rncb.ru','рнкб,rncb']
  ];
  const CRYPTO=[
    ['binance','Binance','binance.com','binance,бинанс,бинансе,бинанс биржа'],
    ['bybit','Bybit','bybit.com','bybit,байбит,бай бай бит'],
    ['okx','OKX','okx.com','okx,окекс,окх'],
    ['coinbase','Coinbase','coinbase.com','coinbase,коинбейз,коинбейс'],
    ['kraken','Kraken','kraken.com','kraken,кракен'],
    ['bitget','Bitget','bitget.com','bitget,битгет'],
    ['kucoin','KuCoin','kucoin.com','kucoin,кукоин'],
    ['mexc','MEXC','mexc.com','mexc,мекс,мексс'],
    ['gateio','Gate.io','gate.io','gate io,gateio,гейт ио'],
    ['htx','HTX','htx.com','htx,huobi,хуоби'],
    ['bingx','BingX','bingx.com','bingx,бинг икс'],
    ['phemex','Phemex','phemex.com','phemex,фемекс'],
    ['bitmart','BitMart','bitmart.com','bitmart,битмарт'],
    ['cryptocom','Crypto.com','crypto.com','crypto com,cryptocom,крипто ком'],
    ['upbit','Upbit','upbit.com','upbit,апбит'],
    ['gemini','Gemini','gemini.com','gemini,джемини биржа'],
    ['uniswap','Uniswap','uniswap.org','uniswap,uni swap,юнисвап,унисвап'],
    ['pancake','PancakeSwap','pancakeswap.finance','pancakeswap,pancake swap,панкейк'],
    ['metamask','MetaMask','metamask.io','metamask,метамаск'],
    ['antarctic','Antarctic Wallet','antarcticwallet.com','anw,анв,antarctic,antarctic wallet,антарктик,антарктик валлет,антарктик кошелек'],
    ['trust','Trust Wallet','trustwallet.com','trust wallet,trustwallet,траст валлет,траст кошелек'],
    ['ledger','Ledger','ledger.com','ledger,леджер'],
    ['trezor','Trezor','trezor.io','trezor,трезор'],
    ['tonkeeper','Tonkeeper','tonkeeper.com','tonkeeper,тонкипер'],
    ['phantom','Phantom','phantom.com','phantom,фантом кошелек,phantom wallet'],
    ['exodus','Exodus','exodus.com','exodus,экзодус'],
    ['rabby','Rabby','rabby.io','rabby,rabby wallet,рэбби'],
    ['backpack','Backpack','backpack.app','backpack,бэкпак'],
    ['tgwallet','Wallet in Telegram','wallet.tg','telegram wallet,wallet telegram,кошелек телеграм,телеграм кошелек,wallet tg'],
    ['cryptobot','Crypto Bot','t.me','crypto bot,cryptobot,криптобот']
  ];
  const PAYMENTS=[
    ['paypal','PayPal','paypal.com','paypal,пейпал,пэйпал'],
    ['wise','Wise','wise.com','wise,transferwise,вайз'],
    ['revolut','Revolut','revolut.com','revolut,револют'],
    ['payeer','Payeer','payeer.com','payeer,паеер,паер'],
    ['advcash','Volet / AdvCash','volet.com','advcash,адвкэш,volet,волет'],
    ['yoomoney','ЮMoney','yoomoney.ru','юмани,юmoney,yoomoney,яндекс деньги'],
    ['webmoney','WebMoney','wmtransfer.com','webmoney,вебмани'],
    ['qiwi','QIWI','qiwi.com','qiwi,киви кошелек,киви банк'],
    ['skrill','Skrill','skrill.com','skrill,скрилл'],
    ['neteller','Neteller','neteller.com','neteller,нетеллер'],
    ['payoneer','Payoneer','payoneer.com','payoneer,пайонир'],
    ['stripe','Stripe','stripe.com','stripe,страйп'],
    ['cashinout','CashInOut','cashinout.io','cashinout,cash in out,кэшин аут,кэшин-аут,кэшинaут']
  ];
  function normalize(value){
    return String(value||'').normalize('NFKC').toLocaleLowerCase('ru-RU').replace(/ё/g,'е')
      .replace(/[^a-zа-я0-9]+/g,' ').replace(/\s+/g,' ').trim();
  }
  const GROUPS=[['Банки',BANKS],['Криптобиржи и кошельки',CRYPTO],['Платёжные сервисы',PAYMENTS]].map(([label,rows])=>({
    label,brands:rows.map(([id,title,domain,rawAliases])=>({
      id,title,domain,aliases:rawAliases.split(',').map(normalize).filter(Boolean)
    }))
  }));
  const BRANDS=GROUPS.flatMap(group=>group.brands);
  const BY_ID=new Map(BRANDS.map(brand=>[brand.id,brand]));
  function matchName(name){
    const words=' '+normalize(name)+' ';
    if(words==='  ')return null;
    // Compare whole normalized words, not substrings: 'ВТБ' must not match unrelated names.
    for(const brand of BRANDS){
      if(brand.aliases.some(alias=>words.includes(' '+alias+' ')))return brand;
    }
    return null;
  }
  function resolveBrand(wallet){
    const override=/^b:([a-z0-9]{1,10})$/.exec(String(wallet?.icon||''));
    if(override){
      if(override[1]==='none')return null;
      if(BY_ID.has(override[1]))return BY_ID.get(override[1]);
    }
    return matchName(wallet?.name);
  }
  function selectedIcon(select,currencySymbol){
    const value=String(select?.value||'auto');
    if(value==='none')return 'b:none';
    if(BY_ID.has(value))return 'b:'+value;
    return currencySymbol;
  }
  function decorateCoin(coin,wallet){
    if(!coin||typeof document==='undefined')return;
    const brand=resolveBrand(wallet);
    if(!brand)return;
    const img=document.createElement('img');
    img.className='finance-wallet-brand-image';
    img.alt='';
    img.setAttribute('aria-hidden','true');
    img.loading='lazy';
    img.decoding='async';
    img.referrerPolicy='no-referrer';
    img.onload=()=>{
      coin.replaceChildren(img);
      coin.classList.add('has-brand-icon');
      coin.setAttribute('title',brand.title);
    };
    img.onerror=()=>{
      if(img.dataset.rudiIconFallback)return;
      img.dataset.rudiIconFallback='1';
      img.src='https://icons.duckduckgo.com/ip3/'+brand.domain+'.ico';
    }; // A second trusted icon source, then retain the currency symbol if both fail.
    img.src='https://www.google.com/s2/favicons?domain='+encodeURIComponent(brand.domain)+'&sz=128';
  }
  function syncComposerHint(select,hint,name){
    if(!hint)return;
    const selected=String(select?.value||'auto');
    if(selected==='none'){hint.textContent='Будет показан стандартный значок валюты.';return;}
    if(selected!=='auto'){hint.textContent='Выбран логотип '+(BY_ID.get(selected)?.title||'бренда')+'.';return;}
    const detected=matchName(name);
    hint.textContent=detected?'Автоматически: '+detected.title+'.':'Бренд не распознан: будет показана валюта.';
  }
  function setupBrandSelect(select,hint,wallet,nameInput){
    if(!select||typeof document==='undefined')return;
    if(select.options.length<3){
      select.replaceChildren();
      for(const [value,label] of [['auto','Автоматически по названию'],['none','Без логотипа (знак валюты)']]){
        const option=document.createElement('option');option.value=value;option.textContent=label;select.append(option);
      }
      for(const group of GROUPS){
        const optgroup=document.createElement('optgroup');optgroup.label=group.label;
        for(const brand of group.brands){
          const option=document.createElement('option');option.value=brand.id;option.textContent=brand.title;optgroup.append(option);
        }
        select.append(optgroup);
      }
    }
    const match=/^b:([a-z0-9]{1,10})$/.exec(String(wallet?.icon||''));
    select.value=match&&(match[1]==='none'||BY_ID.has(match[1]))?match[1]:'auto';
    const name=()=>String(nameInput?.value??wallet?.name??'');
    if(!select.dataset.rudiBrandBound){
      select.addEventListener('change',()=>syncComposerHint(select,hint,name()));
      nameInput?.addEventListener('input',()=>syncComposerHint(select,hint,name()));
      select.dataset.rudiBrandBound='1';
    }
    syncComposerHint(select,hint,name());
  }
  const api={groups:GROUPS,brands:BRANDS,normalize,matchName,resolveBrand,selectedIcon,decorateCoin,setupBrandSelect};
  if(typeof module==='object'&&module.exports)module.exports=api;
  if(root)root.RudiWalletBrandIcons=api;
})(typeof window!=='undefined'?window:null);
