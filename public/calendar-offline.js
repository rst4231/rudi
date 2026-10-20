/* Calendar-only offline snapshots and cautious mutation queue. No auth secrets are persisted. */
(function (root) {
  'use strict';
  const DATABASE = 'rudi-calendar-offline-v1';
  let actor = '';
  let pending = 0;
  let needsReview = 0;
  let syncing = false;
  const offlineNow = () => root.__rudiNetworkReachable === true ? false :
    navigator.onLine === false || root.document?.body?.dataset?.offlineMode === '1';
  const clone = value => JSON.parse(JSON.stringify(value));
  const id = () => (root.crypto?.randomUUID?.() || String(Date.now()) + '-' + Math.random().toString(36).slice(2));
  const key = (who, scope, month) => [who, scope, month].join('|');

  function open() {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(DATABASE, 1);
      request.onupgradeneeded = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains('snapshots')) db.createObjectStore('snapshots', { keyPath: 'key' });
        if (!db.objectStoreNames.contains('outbox')) db.createObjectStore('outbox', { keyPath: 'id' });
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error || Error('offline-db-open'));
      request.onblocked = () => reject(Error('offline-db-blocked'));
    });
  }

  async function store(name, mode, task) {
    const db = await open();
    return new Promise((resolve, reject) => {
      let result;
      const tx = db.transaction(name, mode);
      const table = tx.objectStore(name);
      try { result = task(table); } catch (e) { tx.abort(); reject(e); return; }
      tx.oncomplete = () => { db.close(); resolve(result && 'result' in result ? result.result : result); };
      tx.onerror = () => { db.close(); reject(tx.error || Error('offline-db-transaction')); };
      tx.onabort = () => { db.close(); reject(tx.error || Error('offline-db-aborted')); };
    });
  }
  const all = name => store(name, 'readonly', table => table.getAll());
  const change = (name, action) => store(name, 'readwrite', action);

  async function summary(who = actor) {
    const rows = (await all('outbox')).filter(row => row.actor === who);
    pending = rows.length;
    needsReview = rows.filter(row => row.state !== 'queued').length;
    root.dispatchEvent(new CustomEvent('rudi-calendar-queue', { detail: { actor: who, pending, needsReview } }));
    return { pending, needsReview };
  }
  async function init(who) {
    actor = String(who || '');
    if (actor) return summary(actor);
    return { pending: 0, needsReview: 0 };
  }
  async function capture(who, scope, month, payload) {
    if (!who || !payload?.days?.length) return;
    // Store server data, never the optimistic overlay.
    await change('snapshots', table => table.put({
      key: key(who, scope, month), savedAt: Date.now(), payload: clone(payload)
    }));
  }
  async function cached(who, scope, month) {
    if (!who) return null;
    const row = await store('snapshots', 'readonly', table => table.get(key(who, scope, month)));
    return row?.payload ? { ...clone(row.payload), stale: true, offlineStale: true, offlineSavedAt:row.savedAt } : null;
  }
  function cleanAgenda(value){
    if(Array.isArray(value))return value.map(cleanAgenda);
    if(value&&typeof value==='object')return Object.fromEntries(Object.entries(value)
      .filter(([key])=>! /^(initData|backupToken|token|accessToken|refreshToken|authorization|secret|password|credential)$/i.test(key))
      .map(([key,item])=>[key,cleanAgenda(item)]));
    return value;
  }
  async function captureAgenda(who,scope,payload){
    if(!['Рустам','Диана'].includes(who)||!['personal','shared'].includes(scope)||!payload?.date)return;
    const data={};
    for(const field of ['ok','configured','connected','enabled','writable','date','tomorrowDate','tasks','tomorrowTasks'])
      if(payload[field]!==undefined)data[field]=payload[field];
    await change('snapshots',table=>table.put({key:key(who,'home-agenda',scope),savedAt:Date.now(),payload:cleanAgenda(data)}));
  }
  async function cachedAgenda(who,scope){
    if(!['Рустам','Диана'].includes(who)||!['personal','shared'].includes(scope))return null;
    const row=await store('snapshots','readonly',table=>table.get(key(who,'home-agenda',scope)));
    return row?.payload?{...clone(row.payload),offlineStale:true,offlineSavedAt:row.savedAt}:null;
  }
  async function enqueue(who, kind, details) {
    if (kind.startsWith('diana-') && who !== 'Диана')throw Error('calendar-offline-owner-forbidden');
    if (!who || !['create', 'update', 'delete', 'complete', 'personal-complete', 'personal-update', 'personal-delete', 'move', 'personal-move', 'diana-create', 'diana-update', 'diana-delete', 'diana-complete'].includes(kind))
      throw Error('calendar-offline-invalid-action');
    const row = {
      id: id(), actor: who, kind, details: clone(details || {}),
      createdAt: Date.now(), state: 'queued'
    };
    await change('outbox', table => table.add(row));
    await summary(who);
    return { ok: true, queued: true, offlineId: row.id };
  }
  function eventFromCreate(row) {
    const value = row.kind==='diana-create'?row.details:(row.details.value || {});
    if(row.kind==='diana-create')return {
      id:'diana-'+value.clientId,title:String(value.title||'Новое дело'),date:String(value.date||''),
      startTime:String(value.time||''),endTime:'',allDay:!value.time,description:String(value.description||''),
      seriesId:'diana-'+value.clientId,seriesDate:String(value.date||''),repeat:value.repeat||'none',repeatEvery:value.repeatEvery||1,repeatDays:value.repeatDays||[],
      repeatFlag:value.repeat&&value.repeat!=='none'?'FREQ='+value.repeat.toUpperCase():'',
      responsible:'Диана',ownerScope:'diana',personal:true,privateLocal:true,projectId:'',projectName:'',
      canEdit:true,canComplete:true,assigned:false,offlinePending:true
    };
    return {
      id: 'rudi-'+String(value.clientId||row.id), title: String(value.title || 'Новое дело'),
      date: String(value.date || ''), startTime: String(value.time || ''),
      endTime: String(value.endTime||''), allDay: !value.time, description: String(value.description || ''),
      responsible: String(value.responsible || ''), repeat: value.repeat || 'none',
      repeatCount: value.repeatCount || 1, repeatDays:Array.isArray(value.repeatDays)?value.repeatDays:[], together: !value.responsible,
      assigned: Boolean(value.responsible), personal: false, canEdit: false,
      canComplete: false, canDelete: false, offlinePending: true
    };
  }
  function dianaOccurrences(task,month){
    const seriesId=task.seriesId||String(task.id).split('__')[0],anchor=task.seriesDate||task.date;
    if(!task.repeat||task.repeat==='none')return [{...task,id:seriesId,date:anchor,seriesId,seriesDate:anchor}];
    const count=new Date(Date.UTC(Number(month.slice(0,4)),Number(month.slice(5,7)),0)).getUTCDate();
    const start=Date.parse(anchor+'T00:00Z')/86400000;
    const offset=(new Date(anchor+'T00:00Z').getUTCDay()+6)%7,every=task.repeatEvery||1,items=[];
    for(let n=1;n<=count;n++){
      const date=month+'-'+String(n).padStart(2,'0'),delta=Date.parse(date+'T00:00Z')/86400000-start;
      const weekday=new Date(date+'T00:00Z').getUTCDay();
      if(delta<0)continue;
      if(task.repeat==='daily'?delta%every===0:(task.repeatDays||[]).includes(weekday)&&Math.floor((delta+offset)/7)%every===0)
        items.push({...task,id:seriesId+'__'+date,date,seriesId,seriesDate:anchor});
    }
    return items;
  }
  function sharedOccurrences(task,month) {
    const anchor=String(task.date||''),repeat=String(task.repeat||'none');
    if(repeat==='none')return [task];
    if(!/^20\d\d-\d\d-\d\d$/.test(anchor)||!/^20\d\d-\d\d$/.test(month))return [];
    const first=new Date(anchor+'T00:00:00Z');
    if(!Number.isFinite(first.getTime()))return [];
    const chosen=Array.isArray(task.repeatDays)?task.repeatDays.map(Number):[];
    const last=new Date(Date.UTC(Number(month.slice(0,4)),Number(month.slice(5,7)),0));
    const results=[],limit=Math.max(1,Math.min(366,Number(task.repeatCount||1)+1));
    let count=0;
    for(let day=new Date(first);day<=last;day.setUTCDate(day.getUTCDate()+1)){
      const date=day.toISOString().slice(0,10),weekday=day.getUTCDay();
      const delta=Math.round((day-first)/86400000);
      const ok=repeat==='daily'||
        repeat==='weekdays'&&weekday>=1&&weekday<=5||
        repeat==='custom'&&chosen.includes(weekday)||
        repeat==='weekly'&&delta%7===0||
        repeat==='monthly'&&day.getUTCDate()===first.getUTCDate()||
        repeat==='yearly'&&date.slice(5)===anchor.slice(5);
      if(!ok)continue;
      count++;if(count>limit)break;
      if(date.slice(0,7)===month)results.push({...task,id:task.id+'__'+date,date,seriesId:task.id});
    }
    return results;
  }
  function overlay(source, rows, month) {
    const result = clone(source) || {ok:true,ticktickDays:[]};
    const days = Array.isArray(result.ticktickDays) ? result.ticktickDays : (result.ticktickDays = []);
    const getDay = date => {
      let day = days.find(x => x.date === date);
      if (!day) { day = { date, events: [] }; days.push(day); }
      if (!Array.isArray(day.events)) day.events = [];
      return day;
    };
    for (const row of rows) {
      // A definite server refusal is not a successful local mutation. Keep
      // the requested change in outbox, but leave the server task visible.
      if(row.state==='blocked')continue;
      const d = row.details || {};
      if (row.kind === 'create' || row.kind === 'diana-create') {
        const item = eventFromCreate(row);
        for(const occurrence of row.kind==='diana-create'?dianaOccurrences(item,month):sharedOccurrences(item,month)){
          if(occurrence.date.slice(0,7)===month&&!getDay(occurrence.date).events.some(task=>task.id===occurrence.id))getDay(occurrence.date).events.push(occurrence);
        }
        continue;
      }
      const taskId = String(d.taskId || '');
      if (!taskId) continue;
      if(row.kind.startsWith('diana-')){
        const seriesId=taskId.split('__')[0];
        let previous=d.task?clone(d.task):null;
        for(const day of days){
          const matching=(day.events||[]).find(task=>task.id===taskId)||
            (!previous&&(day.events||[]).find(task=>!task.completed&&(task.seriesId||task.id.split('__')[0])===seriesId));
          if(matching)previous=clone(matching);
        }
        const seriesWide=row.kind==='diana-update'||row.kind==='diana-delete';
        for(const day of days)day.events=(day.events||[]).filter(task=>task.completed||
          (seriesWide?(task.seriesId||task.id.split('__')[0])!==seriesId:task.id!==taskId));
        if(row.kind==='diana-delete'||!previous)continue;
        if(row.kind==='diana-complete'){
          if(previous.date.slice(0,7)===month)getDay(previous.date).events.push({...previous,completed:true,completedAt:new Date(row.createdAt).toISOString(),canComplete:false,canEdit:false,offlinePending:true});
          continue;
        }
        const anchor=d.operation==='move'?(previous.seriesDate||previous.date):(d.date??previous.seriesDate??previous.date);
        const next={...previous,...d,id:seriesId,seriesId,seriesDate:anchor,date:anchor,
          startTime:d.time===undefined?previous.startTime:d.time,offlinePending:true};
        delete next.task;delete next.operation;delete next.taskId;
        next.allDay=!next.startTime;
        next.repeatFlag=next.repeat&&next.repeat!=='none'?'FREQ='+next.repeat.toUpperCase():'';
        for(const occurrence of dianaOccurrences(next,month)){
          if(occurrence.date.slice(0,7)===month&&!getDay(occurrence.date).events.some(task=>task.id===occurrence.id))getDay(occurrence.date).events.push(occurrence);
        }
        continue;
      }
      let old = d.task ? clone(d.task) : null;
      const sharedSeriesId=taskId.split('__')[0];
      const seriesMutation=['update','delete','move'].includes(row.kind);
      for (const day of days) {
        if (!Array.isArray(day.events)) continue;
        const entry = day.events.find(x => String(x?.id || '') === taskId);
        if (entry) old = clone(entry);
        day.events = day.events.filter(x => String(x?.id || '') !== taskId&&
          !(seriesMutation&&String(x?.seriesId||'')===sharedSeriesId));
      }
      if (row.kind === 'complete' || row.kind === 'personal-complete' || row.kind === 'personal-delete' || row.kind === 'delete' || row.kind === 'diana-delete' || row.kind === 'diana-complete') continue;
      if (!old) continue;
      const value = row.kind==='diana-update'||row.kind==='personal-update'?d:(d.value || {});
      const next = {
        ...old, title: value.title === undefined ? old.title : value.title,
        description: value.description === undefined ? old.description : value.description,
        responsible: value.responsible === undefined ? old.responsible : value.responsible,
        repeat: value.repeat === undefined ? old.repeat : value.repeat,
        repeatCount: value.repeatCount === undefined ? old.repeatCount : value.repeatCount,
        repeatDays: value.repeatDays===undefined?old.repeatDays:value.repeatDays,
        date: String(value.date || d.date || old.date),
        startTime: value.time === undefined && d.time === undefined ? old.startTime : String(value.time ?? d.time ?? ''),
        endTime: value.endTime===undefined ? old.endTime : String(value.endTime||''),
        offlinePending: true
      };
      next.allDay = !next.startTime;
      if(next.personal){
        if(next.date.slice(0,7)===month)getDay(next.date).events.push(next);
      }else{
        const task={...next,id:sharedSeriesId};
        for(const occurrence of sharedOccurrences(task,month)){
          if(!getDay(occurrence.date).events.some(event=>String(event.id)===String(occurrence.id)))
            getDay(occurrence.date).events.push(occurrence);
        }
      }
    }
    for(const day of days)day.events=(day.events||[]).filter(task=>!task.completed||!task.expiresAt||Date.parse(task.expiresAt)>Date.now());
    days.sort((a, b) => String(a.date).localeCompare(String(b.date)));
    result.offlinePending = rows.length;
    result.offlineNeedsReview = rows.filter(x => x.state !== 'queued').length;
    return result;
  }
  async function materialize(who, month, payload, scope) {
    const rows = (await all('outbox')).filter(row => row.actor === who && (!scope ||
      (row.kind.startsWith('personal-')||row.kind.startsWith('diana-')?scope==='personal':scope==='shared')))
      .sort((a,b)=>a.createdAt-b.createdAt||a.id.localeCompare(b.id));
    return overlay(payload, rows, month);
  }

  function overlayAgenda(payload, rows) {
    if (!payload?.date) return payload;
    const dates = [payload.date, payload.tomorrowDate].filter(Boolean);
    const source = {ticktickDays: dates.map((date,index)=>({date,
      events:(payload[index?'tomorrowTasks':'tasks']||[]).map(task=>({...task,date}))}))};
    const days = [...new Set(dates.map(date=>date.slice(0,7)))].flatMap(month=>
      overlay(source,rows,month).ticktickDays.filter(day=>day.date.slice(0,7)===month));
    const forDay = date=>days.filter(day=>day.date===date).flatMap(day=>day.events)
      .filter(task=>!task.completed).sort((a,b)=>String(a.startTime||'99:99').localeCompare(String(b.startTime||'99:99')));
    return {...payload,tasks:forDay(payload.date),tomorrowTasks:forDay(payload.tomorrowDate),
      offlinePending:rows.length,offlineNeedsReview:rows.filter(row=>row.state!=='queued').length};
  }
  async function materializeAgenda(who, scope, payload) {
    const rows=(await all('outbox')).filter(row=>row.actor===who&&
      ((row.kind.startsWith('personal-')||row.kind.startsWith('diana-'))?scope==='personal':scope==='shared'))
      .sort((a,b)=>a.createdAt-b.createdAt||a.id.localeCompare(b.id));
    return overlayAgenda(payload,rows);
  }
  async function acknowledge(row) {
    // Keep the confirmed edit in disk snapshots before removing its overlay.
    // Reapplying an edit after a crash is safe; losing the edit is not.
    if(row.kind==='personal-update'||row.kind==='diana-update'){
      const snapshots=(await all('snapshots')).filter(item=>item.key.startsWith(row.actor+'|'));
      for(const snapshot of snapshots){
        const [,scope,month]=snapshot.key.split('|');
        if(scope==='home-agenda'&&month==='personal')snapshot.payload=overlayAgenda(snapshot.payload,[row]);
        else if(scope==='personal')snapshot.payload=overlay(snapshot.payload,[row],month);
        else continue;
        snapshot.savedAt=Math.max(snapshot.savedAt,row.createdAt);
        await change('snapshots',table=>table.put(snapshot));
      }
    }
    await change('outbox',table=>table.delete(row.id));
  }

  function endpoint(row) {
    const k = row.kind;
    if(k==='diana-create')return '/api/partner-message?ticktickAction=personal-task-create';
    if(['diana-update','diana-delete','diana-complete'].includes(k))return '/api/partner-message?ticktickAction=personal-task-edit';
    if (k === 'create') return '/api/ticktick/task-create';
    if (k === 'update') return '/api/ticktick/task-update';
    if (k === 'delete') return '/api/ticktick/task-delete';
    if (k === 'complete') return '/api/ticktick/task-complete';
    if (k === 'personal-complete') return '/api/partner-message?ticktickAction=personal-task-complete';
    if (k==='personal-update'||k==='personal-delete') return '/api/partner-message?ticktickAction=personal-task-edit';
    if (k === 'personal-move') return '/api/partner-message?ticktickAction=personal-task-move';
    if (k === 'move') return '/api/partner-message?ticktickAction=task-move';
    throw Error('calendar-offline-unsupported-action');
  }

  // Do not replay an uncertain POST until a fresh TickTick read confirms
  // whether the requested mutation already took effect.
  let lastAuth=null;
  const string=value=>String(value??'').trim();
  function snapshotEvents(snapshot){
    return (snapshot?.ticktickDays||[]).flatMap(day=>
      (day.events||[]).map(task=>({...task,date:string(day.date)})));
  }
  async function reconcile(row,who,auth,reads){
    // Diana creates use atomic insert-if-absent IDs; edits and tombstones are
    // idempotent too. Retrying never creates a second task after a lost response.
    if(row.kind.startsWith('diana-'))return who==='Диана'?'retry':'unknown';
    if(!row.kind.startsWith('personal-'))return 'retry'; // native shared mutations are idempotent
    const data=row.details||{}, value=data.value||(row.kind==='personal-update'?data:{}), taskId=string(data.taskId);
    // Updating the same stable task ID with the same fields is idempotent.
    // It does not need a month-calendar read (which also depends on the shared
    // integration). Cross-list moves create a copy, so still require readback.
    if(row.kind==='personal-update'&&data.operation==='save'&&taskId&&string(data.projectId)&&
      string(data.targetProjectId||data.projectId)===string(data.projectId))return 'retry';
    const personal=row.kind.startsWith('personal-');
    const scope=personal?'rustam':'shared';
    const snapshots=(await all('snapshots')).filter(s=>
      s.key.startsWith(who+'|')&&s.savedAt<=row.createdAt);
    const historic=snapshots.flatMap(s=>snapshotEvents(s.payload));
    const original=historic.find(e=>string(e.id)===taskId)||data.task||null;
    const date=string(value.date||data.date||original?.date);
    const months=[...new Set([date.slice(0,7),...snapshots.map(s=>s.key.slice(-7))])]
      .filter(month=>/^\d{4}-\d{2}$/.test(month)).slice(0,8);
    if(!months.length)return 'unknown';
    let found=null,readable=0,allTasks=[];
    for(const month of months){
      const key=scope+'|'+month;
      if(!reads.has(key)){
        try{
          const response=await fetch('/api/ticktick/calendar',{
            method:'POST',headers:{'Content-Type':'application/json'},
            body:JSON.stringify({...auth(),view:'month',month,scope}),
            cache:'no-store'
          });
          const value=await response.json().catch(()=>null);
          reads.set(key,response.ok&&value?.ok!==false&&value?.stale!==true
            &&(personal?value?.personalUnavailable!==true&&value?.personalConnected!==false:value?.sharedUnavailable!==true)
            &&Array.isArray(value?.days)?snapshotEvents({ticktickDays:value.days}):null);
        }catch(_){reads.set(key,null)}
      }
      const tasks=reads.get(key);
      if(!tasks)return 'unknown';
      readable++;
      allTasks.push(...tasks);
      if(taskId){const match=tasks.find(t=>string(t.id)===taskId);if(match)found=match}
    }
    if(!readable)return 'unknown';
    const age=Date.now()-row.createdAt;
    if(row.kind==='create'){
      const matches=allTasks.filter(task=>
        string(task.title)===string(value.title)&&string(task.date)===string(value.date)
        &&string(task.startTime)===string(value.time));
      if(matches.length===1&&!historic.some(task=>string(task.id)===string(matches[0].id)))
        return 'done';
      // Cannot safely infer a failed create from absence alone.
      return 'unknown';
    }
    if(row.kind==='complete'||row.kind==='personal-complete'||row.kind==='personal-delete'||row.kind==='delete'){
      if(row.kind!=='delete'&&found?.completed===true)return 'done';
      if(!found&&original)return 'done';
      if(found&&age>20000)return 'retry';
      return 'unknown';
    }
    if(row.kind==='update'||row.kind==='personal-update'||row.kind==='move'||row.kind==='personal-move'){
      const targetDate=string(value.date||data.date),targetTime=string(value.time??data.time);
      if(found&&string(found.date)===targetDate&&string(found.startTime)===targetTime
        &&(!['update','personal-update'].includes(row.kind)||string(found.title)===string(value.title)))return 'done';
      if(found&&age>20000)return 'retry';
      return 'unknown';
    }
    return 'unknown';
  }

  async function flush(who, auth){
    if(syncing||!who||offlineNow()||typeof auth!=='function')return {sent:0,pending};
    lastAuth=auth;
    syncing=true;
    let sent=0;
    const reads=new Map();
    try{
      const rows=(await all('outbox')).filter(row=>row.actor===who)
        .sort((a,b)=>a.createdAt-b.createdAt||a.id.localeCompare(b.id));
      const waitingTasks=new Set();
      for(const row of rows){
        if(offlineNow())break;
        const details=row.details||{};
        const taskKey=details.taskId
          ?(row.kind.startsWith('personal-')?'personal':row.kind.startsWith('diana-')?'diana':'shared')+'|'+string(details.taskId).split('__')[0]
          :row.id;
        if(waitingTasks.has(taskKey))continue;
        const now=Date.now();
        if(row.state==='blocked'){
          if(now<Number(row.retryAt||0)){waitingTasks.add(taskKey);continue;}
          row.state='queued';
        }else if(row.state!=='queued'){
          if(now<Number(row.checkAt||0)){waitingTasks.add(taskKey);continue;}
          const decision=await reconcile(row,who,auth,reads);
          if(decision==='done'){
            await acknowledge(row);
            sent++;
            continue;
          }
          if(decision!=='retry'){
            row.state='review';
            row.checkAt=Date.now()+30000;
            row.error='Не удалось подтвердить изменение на сервере';
            await change('outbox',table=>table.put(row));
            waitingTasks.add(taskKey);
            continue;
          }
          row.state='queued';
        }
        const {task,value,...parameters}=row.details||{};
        const body={...auth(),...parameters,...(value||{})};
        row.state='inflight';
        row.attempts=(row.attempts||0)+1;
        delete row.checkAt;
        await change('outbox',table=>table.put(row));
        try{
          const response=await fetch(endpoint(row),{
            method:'POST',headers:{'Content-Type':'application/json'},
            body:JSON.stringify(body),cache:'no-store'
          });
          const payload=await response.json().catch(()=>({}));
          if(!response.ok||payload.ok!==true){
            if(response.status>=500||response.status===408||response.status===504){
              row.state='review'; // Unclear whether an upstream write committed.
              row.checkAt=Date.now()+30000;
            }else{
              row.state='blocked'; // Explicit non-transient refusal.
              row.retryAt=Date.now()+Math.min(600000,15000*2**Math.min(5,row.attempts-1));
            }
            row.error=response.status===401||response.status===403
              ?'Проверь авторизацию RUDI'
              :response.status===429?'Сервис ограничил частоту запросов'
              :'Ответ сервера: '+response.status;
            await change('outbox',table=>table.put(row));
            break;
          }
          await acknowledge(row);
          sent++;
          reads.clear();
        }catch(_){
          row.state='review';
          row.checkAt=Date.now()+30000;
          row.error='Проверка доставки после обрыва связи';
          await change('outbox',table=>table.put(row));
          break;
        }
      }
      const state=await summary(who);
      if(sent)root.dispatchEvent(new CustomEvent('rudi-calendar-synced',{detail:{sent,...state}}));
      return {sent,...state};
    }finally{
      syncing=false;
      root.dispatchEvent(new CustomEvent('rudi-calendar-flush-idle'));
    }
  }
  // iOS PWA does not always emit "online". Retry only while calendar is in
  // the foreground and there are local operations, never on an empty queue.
  root.setInterval?.(()=>{
    if(actor&&pending>0&&lastAuth&&!syncing&&
      root.document?.visibilityState==='visible'&&
      ['schedule','home'].includes(root.document?.body?.dataset?.appTab)&&!offlineNow()){
      flush(actor,lastAuth).catch(error=>console.warn(
        'RUDI_CALENDAR_RECONCILE_WARN',String(error?.message||error)));
    }
  },20000);
  root.rudiCalendarOffline = {
    init, cached, capture, cachedAgenda, captureAgenda, materialize, materializeAgenda, enqueue, flush, summary,
    hasPendingSync: () => pending > 0,
    isSyncing: () => syncing,
    isOffline: offlineNow,
    status: () => ({ pending, needsReview })
  };
})(window);
