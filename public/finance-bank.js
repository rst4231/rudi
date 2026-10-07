(()=>{
  const telegram=()=>window.Telegram?.WebApp;
  const SYNC_FROM='2026-10-08';
  let selectedWalletId='',stateCache=null,stateAt=0;

  const request=async(operation,payload={})=>{
    try{await Promise.resolve(window.__rudiTelegramSdkReady)}catch(_){}
    const initData=telegram()?.initData||'';
    const res=await fetch('/api/finances',{
      method:'POST',
      headers:{'Content-Type':'application/json'},
      body:JSON.stringify({initData,operation,...payload}),
      cache:'no-store'
    });
    const data=await res.json().catch(()=>({}));
    if(!res.ok||!data.ok)throw new Error(data.error||'finance-request-failed');
    return data;
  };
  const state=async(force=false)=>{
    if(!force&&stateCache&&Date.now()-stateAt<10000)return stateCache;
    stateCache=await request('list');stateAt=Date.now();return stateCache;
  };
  const norm=value=>String(value??'').trim().toLocaleLowerCase('ru-RU').replace(/ё/g,'е').replace(/\s+/g,' ');
  const money=value=>{
    let raw=String(value??'').trim().replace(/\u00a0/g,'').replace(/\s+/g,'').replace(/[₽рrub]/ig,'');
    if(raw.includes(',')&&raw.includes('.')){
      if(raw.lastIndexOf(',')>raw.lastIndexOf('.'))raw=raw.replace(/\./g,'').replace(',','.');
      else raw=raw.replace(/,/g,'');
    }else raw=raw.replace(',','.');
    raw=raw.replace(/[^0-9+\-.]/g,'');
    const n=Number(raw);return Number.isFinite(n)?n:NaN;
  };
  const splitCsvLine=(line,delimiter)=>{
    const out=[];let cur='',quoted=false;
    for(let i=0;i<line.length;i++){
      const ch=line[i];
      if(ch==='"'){
        if(quoted&&line[i+1]==='"'){cur+='"';i++}else quoted=!quoted;
      }else if(ch===delimiter&&!quoted){out.push(cur);cur=''}else cur+=ch;
    }
    out.push(cur);return out.map(v=>v.trim());
  };
  const parseCsv=text=>{
    const cleaned=String(text||'').replace(/^\uFEFF/,'').replace(/\r/g,'');
    const lines=cleaned.split('\n').filter(line=>line.trim());
    if(lines.length<2)throw new Error('ozon-csv-empty');
    const sample=lines.slice(0,5).join('\n');
    const candidates=[';','\t',','];
    const delimiter=candidates.map(d=>({d,n:(sample.match(new RegExp(d==='\t'?'\\t':'\\'+d,'g'))||[]).length})).sort((a,b)=>b.n-a.n)[0].d;
    return lines.map(line=>splitCsvLine(line,delimiter));
  };
  const headerIndex=(headers,names)=>{
    const normalized=headers.map(norm);
    for(const name of names){
      const exact=normalized.indexOf(norm(name));if(exact>=0)return exact;
    }
    for(let i=0;i<normalized.length;i++){
      if(names.some(name=>normalized[i].includes(norm(name))))return i;
    }
    return -1;
  };
  const parseDate=value=>{
    const raw=String(value||'').trim();
    if(!raw)return null;
    let m=raw.match(/^(\d{1,2})[.\/-](\d{1,2})[.\/-](\d{4})(?:[ T,]+(\d{1,2}):(\d{2})(?::(\d{2}))?)?/);
    if(m){
      const dd=String(m[1]).padStart(2,'0'),mm=String(m[2]).padStart(2,'0'),yyyy=m[3],hh=String(m[4]||'12').padStart(2,'0'),mi=String(m[5]||'00').padStart(2,'0'),ss=String(m[6]||'00').padStart(2,'0');
      const d=new Date(`${yyyy}-${mm}-${dd}T${hh}:${mi}:${ss}+03:00`);return Number.isNaN(d.getTime())?null:d;
    }
    const d=new Date(raw);return Number.isNaN(d.getTime())?null:d;
  };
  const hash=value=>{
    let h=2166136261;
    for(let i=0;i<value.length;i++){h^=value.charCodeAt(i);h=Math.imul(h,16777619)}
    return (h>>>0).toString(36);
  };
  const categoryFor=(rawCategory,description,categories=[])=>{
    const raw=String(rawCategory||'').trim();
    const hay=norm(raw+' '+description);
    const rows=Array.isArray(categories)?categories:[];
    const exact=rows.find(c=>norm(c.name)===norm(raw));if(exact)return exact.name;
    const find=parts=>rows.find(c=>parts.some(p=>norm(c.name).includes(p)))?.name||'';
    if(/продукт|супермаркет|grocery|food market/.test(hay))return find(['продукт'])||raw||'Продукты';
    if(/кафе|ресторан|фастфуд|кофе|restaurant|cafe/.test(hay))return find(['еда вне дома','кафе','ресторан'])||raw||'Еда вне дома';
    if(/кино|cinema|развлеч|досуг/.test(hay))return find(['досуг','развлеч'])||raw||'Развлечения';
    if(/такси|транспорт|метро|автобус|топлив|бензин/.test(hay))return find(['транспорт'])||raw||'Транспорт';
    if(/аптек|медицин|pharmacy/.test(hay))return find(['здоров','аптек'])||raw||'Здоровье';
    if(/маркетплейс|магазин|покупк|ozon|wildberries/.test(hay))return find(['покупк'])||raw||'Покупки';
    return raw.slice(0,48)||'Покупки';
  };
  const parseOzon=async(file,wallet,data)=>{
    const table=parseCsv(await file.text());
    const headers=table[0];
    const dateI=headerIndex(headers,['дата операции','дата и время','дата','operation date','date']);
    const amountI=headerIndex(headers,['сумма операции','сумма','amount']);
    const debitI=headerIndex(headers,['расход','списание','debit']);
    const creditI=headerIndex(headers,['приход','поступление','зачисление','credit']);
    const typeI=headerIndex(headers,['тип операции','тип','operation type','type']);
    const descI=headerIndex(headers,['описание','операция','назначение','детали','получатель','магазин','merchant','description']);
    const categoryI=headerIndex(headers,['категория','category']);
    const idI=headerIndex(headers,['id операции','ид операции','номер операции','transaction id','operation id','id']);
    const balanceI=headerIndex(headers,['остаток','баланс','balance']);
    if(dateI<0||(amountI<0&&debitI<0))throw new Error('ozon-csv-columns');

    const expenses=[];let skipped=0,latestBalance=null,latestBalanceAt=0;
    const duplicateCounter=new Map();
    for(let ri=1;ri<table.length;ri++){
      const row=table[ri];if(!row?.length)continue;
      const date=parseDate(row[dateI]);if(!date){skipped++;continue}
      const iso=date.toISOString(),dateKey=new Intl.DateTimeFormat('en-CA',{timeZone:'Europe/Moscow'}).format(date);
      if(dateKey<SYNC_FROM)continue;
      const type=typeI>=0?norm(row[typeI]):'';
      const desc=descI>=0?String(row[descI]||'').trim():'';
      const rawCategory=categoryI>=0?String(row[categoryI]||'').trim():'';
      const debit=debitI>=0?Math.abs(money(row[debitI])):NaN;
      const credit=creditI>=0?Math.abs(money(row[creditI])):NaN;
      const amountRaw=amountI>=0?money(row[amountI]):NaN;
      const incomeHint=/пополн|зачисл|возврат|кэшб|cashback|refund|income/.test(type+' '+norm(desc));
      const expenseHint=/спис|покуп|оплат|снят|перевод|debit|purchase|payment/.test(type+' '+norm(desc));
      let amount=NaN;
      if(Number.isFinite(debit)&&debit>0)amount=debit;
      else if(Number.isFinite(credit)&&credit>0)amount=NaN;
      else if(Number.isFinite(amountRaw)){
        if(amountRaw<0)amount=Math.abs(amountRaw);
        else if(expenseHint&&!incomeHint)amount=amountRaw;
        else if(!incomeHint)amount=amountRaw;
      }
      if(!Number.isFinite(amount)||amount<=0)continue;
      const categoryName=categoryFor(rawCategory,desc,data.categories);
      const explicit=idI>=0?String(row[idI]||'').trim():'';
      const canonical=[iso,amount.toFixed(2),norm(desc),norm(rawCategory),norm(type)].join('|');
      const base=explicit||hash(canonical);
      const count=(duplicateCounter.get(base)||0)+1;duplicateCounter.set(base,count);
      const importKey='ozon:'+wallet.id+':'+base+(count>1?':'+count:'');
      const month=dateKey.slice(0,7);
      expenses.push({
        categoryName,amount,sourceAmount:amount,sourceCurrency:'RUB',exchangeRate:1,
        month,occurredAt:iso,note:desc.slice(0,120),walletId:wallet.id,importKey
      });
      if(balanceI>=0){
        const b=money(row[balanceI]);
        if(Number.isFinite(b)&&date.getTime()>=latestBalanceAt){latestBalance=b;latestBalanceAt=date.getTime()}
      }
    }
    return {rows:expenses,skipped,latestBalance};
  };
  const walletPayload=(wallet,extra={})=>({
    id:wallet.id,name:wallet.name,icon:wallet.icon||'💳',currency:wallet.currency||'RUB',
    balance:Number(wallet.balance||0),type:wallet.type==='credit'?'credit':'regular',
    creditLimit:Number(wallet.creditLimit||0),annualRate:Number(wallet.annualRate||0),minimumPayment:Number(wallet.minimumPayment||0),
    importSource:wallet.importSource||'',bankSyncFrom:wallet.bankSyncFrom||'',bankLastSyncAt:wallet.bankLastSyncAt||'',...extra
  });
  const getWallet=async(force=false)=>{
    if(!selectedWalletId)return null;
    const data=await state(force);return (data.wallets||[]).find(w=>w.id===selectedWalletId)||null;
  };
  const ui=()=>{
    let card=document.getElementById('financeBankConnectionCard');if(card)return card;
    const balance=document.getElementById('financeWalletBalance')?.closest('.finance-input-field');
    const save=document.getElementById('financeWalletSaveButton');if(!save)return null;
    card=document.createElement('section');card.id='financeBankConnectionCard';card.className='finance-bank-card';card.hidden=true;
    card.innerHTML='<div class="finance-bank-head"><div><strong>Ozon Bank</strong><span id="financeBankStatus">Не подключён</span></div><span class="finance-bank-badge">Банк</span></div><div class="finance-bank-meta"><span>Импорт с</span><b>08.10.2026</b></div><div class="finance-bank-actions"><button id="financeBankConnect" type="button">Подключить</button><button id="financeBankImport" type="button" hidden>Обновить выпиской</button><button id="financeBankDisconnect" type="button" hidden>Отключить</button></div><input id="financeBankFile" type="file" accept=".csv,.txt,text/csv,text/plain" hidden><div id="financeBankMessage" class="finance-bank-message"></div>';
    (balance||save).insertAdjacentElement('afterend',card);
    document.getElementById('financeBankConnect')?.addEventListener('click',connect);
    document.getElementById('financeBankImport')?.addEventListener('click',()=>document.getElementById('financeBankFile')?.click());
    document.getElementById('financeBankDisconnect')?.addEventListener('click',disconnect);
    document.getElementById('financeBankFile')?.addEventListener('change',onFile);
    return card;
  };
  const render=async()=>{
    const card=ui();if(!card)return;
    const wallet=await getWallet(true).catch(()=>null);
    card.hidden=!wallet;
    if(!wallet)return;
    const linked=wallet.importSource==='ozon';
    const status=document.getElementById('financeBankStatus'),connectBtn=document.getElementById('financeBankConnect'),importBtn=document.getElementById('financeBankImport'),disconnectBtn=document.getElementById('financeBankDisconnect');
    if(status)status.textContent=linked?(wallet.bankLastSyncAt?'Подключён · '+new Intl.DateTimeFormat('ru-RU',{day:'2-digit',month:'2-digit',hour:'2-digit',minute:'2-digit',timeZone:'Europe/Moscow'}).format(new Date(wallet.bankLastSyncAt)):'Подключён'):'Не подключён';
    if(connectBtn)connectBtn.hidden=linked;if(importBtn)importBtn.hidden=!linked;if(disconnectBtn)disconnectBtn.hidden=!linked;
  };
  async function connect(){
    const wallet=await getWallet(true);if(!wallet)return;
    const message=document.getElementById('financeBankMessage');if(message)message.textContent='Подключаю…';
    try{
      stateCache=await request('save-wallet',walletPayload(wallet,{importSource:'ozon',bankSyncFrom:SYNC_FROM}));
      stateAt=Date.now();if(message)message.textContent='Ozon Bank подключён к этому кошельку';await render();
      setTimeout(()=>document.getElementById('financeBankFile')?.click(),250);
    }catch(_){if(message)message.textContent='Не удалось подключить Ozon Bank'}
  }
  async function disconnect(){
    const wallet=await getWallet(true);if(!wallet)return;
    const message=document.getElementById('financeBankMessage');if(message)message.textContent='Отключаю…';
    try{
      stateCache=await request('save-wallet',walletPayload(wallet,{importSource:'',bankSyncFrom:'',bankLastSyncAt:''}));
      stateAt=Date.now();if(message)message.textContent='Ozon Bank отключён. История расходов сохранена.';await render();
    }catch(_){if(message)message.textContent='Не удалось отключить Ozon Bank'}
  }
  async function onFile(event){
    const file=event.target.files?.[0];event.target.value='';if(!file)return;
    const wallet=await getWallet(true);if(!wallet)return;
    const message=document.getElementById('financeBankMessage');if(message)message.textContent='Читаю выписку…';
    try{
      const data=await state(true),parsed=await parseOzon(file,wallet,data);
      if(!parsed.rows.length)throw new Error('ozon-no-expenses');
      let imported=0,duplicates=0,skipped=parsed.skipped,last=null;
      for(let i=0;i<parsed.rows.length;i+=300){
        if(message)message.textContent='Импортирую '+Math.min(i+300,parsed.rows.length)+' из '+parsed.rows.length+'…';
        const result=await request('import-expenses',{rows:parsed.rows.slice(i,i+300),importSource:'ozon',walletId:wallet.id});
        last=result;imported+=Number(result.importResult?.imported||0);duplicates+=Number(result.importResult?.duplicates||0);skipped+=Number(result.importResult?.skipped||0);
      }
      const updatedWallet=(last?.wallets||data.wallets||[]).find(w=>w.id===wallet.id)||wallet;
      const nextBalance=Number.isFinite(parsed.latestBalance)?parsed.latestBalance:Number(updatedWallet.balance||0);
      stateCache=await request('save-wallet',walletPayload(updatedWallet,{balance:nextBalance,importSource:'ozon',bankSyncFrom:updatedWallet.bankSyncFrom||SYNC_FROM,bankLastSyncAt:new Date().toISOString()}));
      stateAt=Date.now();
      if(message)message.textContent='Готово: '+imported+' расходов'+(duplicates?' · дублей '+duplicates:'')+(skipped?' · пропущено '+skipped:'');
      await render();
      setTimeout(()=>location.reload(),700);
    }catch(error){
      const code=String(error?.message||'');
      if(message)message.textContent=code.includes('columns')?'Не узнал формат выписки Ozon. Нужен CSV с датой и суммой.'
        :code.includes('no-expenses')?'В выписке после 08.10.2026 нет расходов.'
        :'Не удалось импортировать выписку Ozon.';
    }
  }

  document.addEventListener('click',event=>{
    const item=event.target.closest?.('#financeWalletList .finance-wallet-item');
    if(item)selectedWalletId=String(item.dataset.walletId||'');
    if(event.target.closest?.('#financeWalletCreateButton'))selectedWalletId='';
  },true);
  document.addEventListener('keydown',event=>{
    const item=event.target.closest?.('#financeWalletList .finance-wallet-item');
    if(item&&(event.key==='Enter'||event.key===' '))selectedWalletId=String(item.dataset.walletId||'');
  },true);

  const modal=document.getElementById('financeWalletComposer');
  if(modal){
    new MutationObserver(()=>{if(!modal.hidden)requestAnimationFrame(()=>render())}).observe(modal,{attributes:true,attributeFilter:['hidden','aria-hidden']});
  }
  ui();
  window.RUDI_BANKS={refresh:()=>render(),syncFrom:SYNC_FROM};
})();