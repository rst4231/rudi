const crypto = require('node:crypto');
const { resolveTelegramBotToken } = require('./products-bought.cjs');
const { assertAllowedTelegramUser } = require('./rudi-access.cjs');
const { authorizeWithSession } = require('./rudi-session.cjs');
const { readCarState, writeMileage, setTyreSeasonInstalled, setLastServiceAt, addCarError, removeCarError, repairCarError, removeRepairArchiveEntry, removeMileageHistoryEntry, addCarNote, removeCarNote, restoreCarNote, restoreCarState } = require('./car-store.cjs');
const { readToken } = require('./ticktick-store.cjs');
const { fetchProjectData, createTickTickTask, completeTickTickTask, tickTickTaskDateKey } = require('./ticktick-client.cjs');
const { createStateBackup, openSnapshot } = require('./rudi-backup.cjs');
const { getLatestPhotos } = require('./shared-album.cjs');
const { createStrictRuntimeCache } = require('./strict-runtime-cache.cjs');

const CONFIG_URL = 'https://raw.githubusercontent.com/rst4231/rudi/main/rudi-config.json';
const CONFIG_TTL_MS = 5 * 60 * 1000;
const TASKS_TTL_MS = 60 * 1000;
const FALLBACK_CAR_PRIORITY_CONFIG = {
  base:{ weather:60, service:50, mileage:40, errors:30, tasks:20, wash:10 },
  tasks:{ overdue:1000, today:900, tomorrow:650, week:500, any:250 },
  service:{ due:980, within500:860, within1000:780, within2500:560, within5000:320 },
  mileage:{ missing:700 },
  errors:{ active:950, perError:8 },
  weather:{ frost:760, seasonal:620, wet:500, spread:350 },
  wash:{ goodWindow:120 },
};
const FALLBACK_CAR_TASK_CONFIG = {
  ticktickProjectId: '6a5490689ba59102ae9fd144',
  taskKeywords: ['машин','авто','салон','яндекс карт'],
  taskColumnKeywords: ['машин'],
  taskLimit: 3,
  priority:FALLBACK_CAR_PRIORITY_CONFIG,
};

let configMemo = null;
let configMemoAt = 0;
let tasksMemo = null;
let tasksMemoAt = 0;
const carDocumentsAlbumCache = createStrictRuntimeCache({ namespace:'rudi-car-documents-album-v2' });

function authenticate(rawInitData, botToken) {
  const raw = String(rawInitData || '').trim();
  const token = String(botToken || '').trim();
  if (!raw || !token) throw new Error('telegram-auth-required');

  const params = new URLSearchParams(raw);
  const receivedHash = String(params.get('hash') || '').toLowerCase();
  if (!/^[0-9a-f]{64}$/.test(receivedHash)) throw new Error('telegram-auth-invalid');

  params.delete('hash');
  const dataCheckString = [...params.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, value]) => key + '=' + value)
    .join('\n');

  const secretKey = crypto.createHmac('sha256', 'WebAppData').update(token).digest();
  const expectedHash = crypto.createHmac('sha256', secretKey).update(dataCheckString).digest('hex');
  const actual = Buffer.from(receivedHash, 'hex');
  const expected = Buffer.from(expectedHash, 'hex');
  if (actual.length !== expected.length || !crypto.timingSafeEqual(actual, expected)) {
    throw new Error('telegram-auth-invalid');
  }

  const authDate = Number(params.get('auth_date'));
  const now = Math.floor(Date.now() / 1000);
  if (!Number.isFinite(authDate) || authDate <= 0 || now - authDate > 86400 || authDate > now + 300) {
    throw new Error('telegram-auth-expired');
  }

  let user;
  try { user = JSON.parse(params.get('user') || 'null'); }
  catch { throw new Error('telegram-user-invalid'); }
  if (!user?.id) throw new Error('telegram-user-invalid');

  return { actor: assertAllowedTelegramUser(user), user };
}

function statusFor(error) {
  const code = String(error?.message || error || '');
  if (code.startsWith('telegram-auth') || code === 'telegram-user-invalid' || code.startsWith('rudi-session')) return 401;
  if (code === 'rudi-access-denied') return 403;
  if (code === 'car-mileage-invalid' || code === 'car-mileage-history-invalid' || code === 'car-mileage-history-not-found' || code === 'car-task-invalid' || code === 'car-task-title-invalid' || code === 'car-task-date-invalid' || code === 'car-error-invalid' || code === 'car-error-not-found' || code === 'car-repair-archive-invalid' || code === 'car-repair-archive-not-found' || code === 'car-repair-cost-invalid' || code === 'car-note-invalid' || code === 'car-note-not-found' || code === 'car-tyre-season-invalid' || code === 'car-service-date-invalid') return 400;
  if (code === 'ticktick-not-connected') return 503;
  if (code.startsWith('ticktick-')) return 502;
  return 500;
}

function serviceScheduleForMileage(mileage) {
  if (!Number.isFinite(Number(mileage))) return null;
  const current = Math.max(0, Math.floor(Number(mileage)));
  if (current <= 5000) return { number:0, mileage:5000 };
  const step = Math.ceil((current - 5000) / 10000);
  return {
    number: Math.max(1, step),
    mileage: 5000 + step * 10000,
  };
}

function moscowDateKey(value = new Date()) {
  const date = value instanceof Date ? value : new Date(value);
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en-CA', {
      timeZone:'Europe/Moscow',
      year:'numeric',
      month:'2-digit',
      day:'2-digit',
    }).formatToParts(date)
      .filter(part => part.type !== 'literal')
      .map(part => [part.type,part.value])
  );
  return [parts.year,parts.month,parts.day].join('-');
}

function dayOffset(dateKey, todayKey) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(dateKey || ''))) return null;
  const left = Date.parse(String(dateKey) + 'T00:00:00Z');
  const right = Date.parse(String(todayKey) + 'T00:00:00Z');
  if (!Number.isFinite(left) || !Number.isFinite(right)) return null;
  return Math.round((left - right) / 86400000);
}

function normalizeTitle(value) {
  return String(value || '')
    .toLocaleLowerCase('ru-RU')
    .replace(/[🚗🗺️🚙🚘]/gu,' ')
    .replace(/[^a-zа-яё0-9]+/giu,' ')
    .trim()
    .replace(/\s+/g,' ');
}

function normalizeCarPriorityConfig(value) {
  const source = value && typeof value === 'object' && !Array.isArray(value) ? value : {};
  const result = {};
  for (const [group,defaults] of Object.entries(FALLBACK_CAR_PRIORITY_CONFIG)) {
    const groupSource = source[group] && typeof source[group] === 'object' && !Array.isArray(source[group]) ? source[group] : {};
    result[group] = {};
    for (const [key,fallback] of Object.entries(defaults)) {
      const numeric = Number(groupSource[key]);
      result[group][key] = Number.isFinite(numeric) ? Math.max(0,Math.min(5000,numeric)) : fallback;
    }
  }
  return result;
}

function normalizeCarTaskConfig(value) {
  const source = value && typeof value === 'object' ? value : {};
  const projectId = String(source.ticktickProjectId || FALLBACK_CAR_TASK_CONFIG.ticktickProjectId).trim();
  const keywords = (Array.isArray(source.taskKeywords) ? source.taskKeywords : FALLBACK_CAR_TASK_CONFIG.taskKeywords)
    .map(value => String(value || '').trim().toLocaleLowerCase('ru-RU'))
    .filter(Boolean)
    .slice(0,20);
  const columnKeywords = (Array.isArray(source.taskColumnKeywords) ? source.taskColumnKeywords : FALLBACK_CAR_TASK_CONFIG.taskColumnKeywords)
    .map(value => String(value || '').trim().toLocaleLowerCase('ru-RU'))
    .filter(Boolean)
    .slice(0,20);
  const taskLimit = Math.min(6,Math.max(1,Number(source.taskLimit) || FALLBACK_CAR_TASK_CONFIG.taskLimit));
  const documentsAlbumUrl = String(source.documentsAlbumUrl || '').trim();
  return {
    ticktickProjectId:projectId,
    taskKeywords:keywords,
    taskColumnKeywords:columnKeywords,
    taskLimit,
    documentsAlbumUrl,
    priority:normalizeCarPriorityConfig(source.priority),
  };
}

async function loadCarTaskConfig() {
  if (configMemo && Date.now() - configMemoAt < CONFIG_TTL_MS) return configMemo;
  let value = FALLBACK_CAR_TASK_CONFIG;
  try {
    const response = await fetch(CONFIG_URL + '?t=' + Date.now(), {
      cache:'no-store',
      headers:{accept:'application/json','user-agent':'RUDI-Car/1.0'},
    });
    if (response.ok) {
      const config = await response.json();
      value = normalizeCarTaskConfig(config?.car);
    }
  } catch {}
  configMemo = normalizeCarTaskConfig(value);
  configMemoAt = Date.now();
  return configMemo;
}

function carColumnIds(project, config) {
  const keywords = Array.isArray(config?.taskColumnKeywords) ? config.taskColumnKeywords : [];
  return new Set(
    (Array.isArray(project?.columns) ? project.columns : [])
      .filter(column => {
        const name = String(column?.name || '').toLocaleLowerCase('ru-RU');
        return keywords.some(keyword => name.includes(keyword));
      })
      .map(column => String(column?.id || '').trim())
      .filter(Boolean)
  );
}

function isCarTask(task, config, allowedColumns = new Set()) {
  const columnId = String(task?.columnId || '').trim();
  if (columnId && allowedColumns.has(columnId)) return true;
  const rawTitle = String(task?.title || '').trim();
  if (/^[🚗🚙🚘]/u.test(rawTitle)) return true;
  const title = rawTitle.toLocaleLowerCase('ru-RU');
  return Boolean(title) && config.taskKeywords.some(keyword => title.includes(keyword));
}

function taskPriority(task, todayKey) {
  const dateKey = tickTickTaskDateKey(task,'Europe/Moscow');
  const offset = dayOffset(dateKey,todayKey);
  if (offset === 0) return { bucket:0, distance:0, dateKey, timing:'today' };
  if (offset !== null && offset < 0 && offset >= -7) {
    return { bucket:1, distance:Math.abs(offset), dateKey, timing:'overdue' };
  }
  if (offset !== null && offset > 0) {
    return { bucket:2, distance:offset, dateKey, timing:'upcoming' };
  }
  if (!dateKey) return { bucket:3, distance:0, dateKey:'', timing:'undated' };
  return { bucket:9, distance:Math.abs(offset ?? 9999), dateKey, timing:'stale' };
}

function normalizeTask(task,todayKey) {
  const priority = taskPriority(task,todayKey);
  return {
    id:String(task?.id || ''),
    projectId:String(task?.projectId || ''),
    title:String(task?.title || '').trim().replace(/^[🚗🚙🚘]\s*/u,''),
    date:priority.dateKey,
    timing:priority.timing,
    repeat:Boolean(String(task?.repeatFlag || '').trim()),
    sortOrder:Number(task?.sortOrder || 0),
    _bucket:priority.bucket,
    _distance:priority.distance,
  };
}

function selectCurrentCarTasks(tasks, config, now = new Date(), allowedColumns = new Set(), excludedIds = new Set()) {
  const todayKey = moscowDateKey(now);
  const candidates = (Array.isArray(tasks) ? tasks : [])
    .filter(task => !excludedIds.has(String(task?.id || '')))
    .filter(task => Number(task?.status ?? 0) === 0)
    .filter(task => isCarTask(task,config,allowedColumns))
    .map(task => normalizeTask(task,todayKey))
    .filter(task => task.id && task._bucket < 9)
    .sort((a,b) =>
      a._bucket - b._bucket ||
      a._distance - b._distance ||
      a.sortOrder - b.sortOrder ||
      a.title.localeCompare(b.title,'ru')
    );

  const seen = new Set();
  const selected = [];
  for (const task of candidates) {
    const key = normalizeTitle(task.title);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    selected.push(task);
    if (selected.length >= config.taskLimit) break;
  }

  return selected.map(({_bucket,_distance,...task}) => task);
}

async function loadCarTasks(options = {}) {
  const force = Boolean(options.force);
  if (!force && tasksMemo && Date.now() - tasksMemoAt < TASKS_TTL_MS) return tasksMemo;

  const [config,token] = await Promise.all([loadCarTaskConfig(),readToken()]);
  if (!token?.accessToken) throw new Error('ticktick-not-connected');

  const project = await fetchProjectData(token.accessToken,config.ticktickProjectId);
  const allowedColumns = carColumnIds(project,config);
  const excludedIds = new Set((Array.isArray(options.excludeIds) ? options.excludeIds : []).map(String));
  const tasks = selectCurrentCarTasks(project?.tasks,config,options.now || new Date(),allowedColumns,excludedIds);

  tasksMemo = {
    available:true,
    projectId:config.ticktickProjectId,
    tasks,
    updatedAt:new Date().toISOString(),
  };
  tasksMemoAt = Date.now();
  return tasksMemo;
}

function cleanTaskId(value) {
  const id = String(value || '').trim();
  if (!/^[A-Za-z0-9_-]{8,100}$/.test(id)) throw new Error('car-task-invalid');
  return id;
}

function cleanCarTaskTitle(value) {
  const title = String(value || '').trim().replace(/^[🚗🚙🚘]\s*/u,'');
  if (!title || title.length > 120) throw new Error('car-task-title-invalid');
  return title;
}

function cleanCarTaskDate(value) {
  const raw = String(value || '').trim();
  if (!raw) return '';
  if (!/^\d{4}-\d{2}-\d{2}$/.test(raw)) throw new Error('car-task-date-invalid');
  const date = new Date(raw + 'T12:00:00Z');
  if (!Number.isFinite(date.getTime()) || date.toISOString().slice(0,10) !== raw) throw new Error('car-task-date-invalid');
  return raw;
}

async function createCarTask(value = {}) {
  const title = cleanCarTaskTitle(value.title);
  const date = cleanCarTaskDate(value.date);
  const [config,token] = await Promise.all([loadCarTaskConfig(),readToken()]);
  if (!token?.accessToken) throw new Error('ticktick-not-connected');

  const task = {
    projectId:config.ticktickProjectId,
    title:'🚗 ' + title,
  };
  if (date) {
    const timestamp = date + 'T00:00:00+0300';
    task.isAllDay = true;
    task.startDate = timestamp;
    task.dueDate = timestamp;
    task.timeZone = 'Europe/Moscow';
  }

  const created = await createTickTickTask(token.accessToken,task);
  tasksMemo = null;
  tasksMemoAt = 0;
  const refreshed = await loadCarTasks({force:true}).catch(() => ({
    available:true,
    projectId:config.ticktickProjectId,
    tasks:[],
    updatedAt:new Date().toISOString(),
  }));
  return {
    createdTask:{
      id:String(created?.id || ''),
      title,
      date,
    },
    ...refreshed,
  };
}

async function completeCarTask(taskId) {
  const id = cleanTaskId(taskId);
  const [config,token] = await Promise.all([loadCarTaskConfig(),readToken()]);
  if (!token?.accessToken) throw new Error('ticktick-not-connected');

  const project = await fetchProjectData(token.accessToken,config.ticktickProjectId);
  const allowedColumns = carColumnIds(project,config);
  const task = (Array.isArray(project?.tasks) ? project.tasks : [])
    .find(row => String(row?.id || '') === id && Number(row?.status ?? 0) === 0);

  if (!task || !isCarTask(task,config,allowedColumns)) throw new Error('car-task-invalid');

  await completeTickTickTask(token.accessToken,config.ticktickProjectId,id);
  tasksMemo = null;
  tasksMemoAt = 0;

  const refreshed = await loadCarTasks({force:true,excludeIds:[id]}).catch(() => ({
    available:true,
    projectId:config.ticktickProjectId,
    tasks:[],
    updatedAt:new Date().toISOString(),
  }));
  return { completedTask:{id,title:String(task.title || '').trim()}, ...refreshed };
}

async function carTasksSafe() {
  try {
    return await loadCarTasks();
  } catch (error) {
    console.warn('RUDI_CAR_TICKTICK_WARN', String(error?.message || error));
    return { available:false, tasks:[], updatedAt:'' };
  }
}

function uniqueCarDocumentPhotos(value) {
  const seenIds=new Set();
  const seenUrls=new Set();
  const unique=[];
  for(const photo of Array.isArray(value)?value:[]){
    const id=String(photo?.id||'').trim();
    const urls=[photo?.originalUrl,photo?.fullUrl,photo?.url]
      .map(url=>String(url||'').trim())
      .filter(Boolean);
    if((id&&seenIds.has(id))||urls.some(url=>seenUrls.has(url))) continue;
    if(id) seenIds.add(id);
    urls.forEach(url=>seenUrls.add(url));
    unique.push(photo);
  }
  return unique;
}

async function carDocumentsSafe(config) {
  const albumUrl=String(config?.documentsAlbumUrl||'').trim();
  if(!albumUrl) return { configured:false, photos:[], totalCount:0, albumUrl:'' };
  try{
    const result=await getLatestPhotos({
      albumConfig:{url:albumUrl},
      albumCache:carDocumentsAlbumCache,
    });
    const photos=uniqueCarDocumentPhotos(
      (Array.isArray(result?.photos)?result.photos:[])
        .filter(photo=>String(photo?.type||'image')!=='video')
        .map(photo=>({
          id:String(photo?.id||''),
          url:String(photo?.url||''),
          fullUrl:String(photo?.fullUrl||photo?.url||''),
          originalUrl:String(photo?.originalUrl||photo?.fullUrl||photo?.url||''),
          width:Number(photo?.width||0)||null,
          height:Number(photo?.height||0)||null,
          fullWidth:Number(photo?.fullWidth||0)||null,
          fullHeight:Number(photo?.fullHeight||0)||null,
          originalWidth:Number(photo?.originalWidth||photo?.fullWidth||0)||null,
          originalHeight:Number(photo?.originalHeight||photo?.fullHeight||0)||null,
          date:String(photo?.date||''),
          caption:String(photo?.caption||'').trim(),
        }))
        .filter(photo=>photo.url&&photo.fullUrl)
    );
    return {
      configured:true,
      photos,
      totalCount:photos.length,
      albumUrl:String(result?.albumUrl||albumUrl),
      title:String(result?.title||'Автодокументы'),
      stale:Boolean(result?.stale),
      updatedAt:String(result?.updatedAt||''),
    };
  }catch(error){
    console.warn('RUDI_CAR_DOCUMENTS_WARN',String(error?.message||error));
    return { configured:true, photos:[], totalCount:0, albumUrl, error:true };
  }
}

async function handleCarRequest(req, res) {
  res.setHeader('Cache-Control','no-store, no-cache, must-revalidate, max-age=0');
  if (req.method !== 'POST') return res.status(405).json({ ok:false, error:'method-not-allowed' });

  const body = req.body && typeof req.body === 'object' && !Array.isArray(req.body) ? req.body : {};
  let session;
  try {
    const botToken = resolveTelegramBotToken(process.env);
    session = authorizeWithSession(
      req,
      body.initData,
      (value) => authenticate(value, botToken),
      { botToken }
    );
  } catch (error) {
    return res.status(statusFor(error)).json({ ok:false, error:String(error?.message || error) });
  }

  if (session.actor !== 'Рустам') {
    return res.status(200).json({ ok:true, actor:session.actor, visible:false });
  }

  const operation = String(body.operation || 'get');
  let previousSnapshot=null;
  if(body.backupToken){
    try{
      previousSnapshot=openSnapshot(String(body.backupToken),{});
      if(
        previousSnapshot?.carState?.mileage!=null
        || (Array.isArray(previousSnapshot?.carState?.errors) && previousSnapshot.carState.errors.length)
        || (Array.isArray(previousSnapshot?.carState?.repairArchive) && previousSnapshot.carState.repairArchive.length)
        || (Array.isArray(previousSnapshot?.carState?.notes) && previousSnapshot.carState.notes.length)
        || (Array.isArray(previousSnapshot?.carState?.mileageHistory) && previousSnapshot.carState.mileageHistory.length)
        || previousSnapshot?.carState?.tyreSeasonInstalled
        || previousSnapshot?.carState?.lastServiceAt
      ){
        await restoreCarState(previousSnapshot.carState).catch(()=>null);
      }
    }catch(_){}
  }
  try {
    if (operation === 'documents') {
      const config=await loadCarTaskConfig();
      const documents=await carDocumentsSafe(config);
      return res.status(200).json({ok:true,actor:session.actor,visible:true,documents});
    }

    if (operation === 'get') {
      const [state,tasks] = await Promise.all([readCarState(),carTasksSafe()]);
      const config = await loadCarTaskConfig();
      return res.status(200).json({
        ok:true,
        actor:session.actor,
        visible:true,
        car:{ make:'Changan', model:'UNI-V', year:2023 },
        state,
        nextService:serviceScheduleForMileage(state.mileage),
        ticktick:tasks,
        priorityConfig:config.priority,
      });
    }

    if (operation === 'set-mileage') {
      const state = await writeMileage(body.mileage);
      const backupToken=await createStateBackup({previousSnapshot}).catch(()=> '');
      return res.status(200).json({
        ok:true,
        actor:session.actor,
        visible:true,
        state,
        nextService:serviceScheduleForMileage(state.mileage),
        backupToken,
      });
    }

    if (operation === 'set-tyre-season') {
      const state = await setTyreSeasonInstalled(body.season);
      const backupToken=await createStateBackup({previousSnapshot}).catch(()=> '');
      return res.status(200).json({
        ok:true,
        actor:session.actor,
        visible:true,
        state,
        nextService:serviceScheduleForMileage(state.mileage),
        backupToken,
      });
    }

    if (operation === 'set-last-service') {
      const state = await setLastServiceAt(body.date);
      const backupToken=await createStateBackup({previousSnapshot}).catch(()=> '');
      return res.status(200).json({
        ok:true,
        actor:session.actor,
        visible:true,
        state,
        nextService:serviceScheduleForMileage(state.mileage),
        backupToken,
      });
    }

    if (operation === 'add-error') {
      const result = await addCarError({
        title:body.title,
        occurredAt:body.occurredAt,
        comment:body.comment,
      });
      const backupToken=await createStateBackup({previousSnapshot}).catch(()=> '');
      return res.status(200).json({
        ok:true,
        actor:session.actor,
        visible:true,
        state:result.state,
        nextService:serviceScheduleForMileage(result.state.mileage),
        error:result.error,
        backupToken,
      });
    }

    if (operation === 'remove-error') {
      const result = await removeCarError(body.errorId);
      const backupToken=await createStateBackup({previousSnapshot}).catch(()=> '');
      return res.status(200).json({
        ok:true,
        actor:session.actor,
        visible:true,
        state:result.state,
        nextService:serviceScheduleForMileage(result.state.mileage),
        removedError:result.removed,
        backupToken,
      });
    }

    if (operation === 'repair-error') {
      const result = await repairCarError(body.errorId,{repairCost:body.repairCost});
      const backupToken=await createStateBackup({previousSnapshot}).catch(()=> '');
      return res.status(200).json({
        ok:true,
        actor:session.actor,
        visible:true,
        state:result.state,
        nextService:serviceScheduleForMileage(result.state.mileage),
        repairedError:result.repaired,
        backupToken,
      });
    }

    if (operation === 'remove-repair-archive') {
      const result = await removeRepairArchiveEntry(body.errorId);
      const backupToken=await createStateBackup({previousSnapshot}).catch(()=> '');
      return res.status(200).json({
        ok:true,
        actor:session.actor,
        visible:true,
        state:result.state,
        nextService:serviceScheduleForMileage(result.state.mileage),
        removedRepair:result.removed,
        backupToken,
      });
    }

    if (operation === 'remove-mileage-history') {
      const result = await removeMileageHistoryEntry({mileage:body.mileage,at:body.at});
      const backupToken=await createStateBackup({previousSnapshot}).catch(()=> '');
      return res.status(200).json({
        ok:true,
        actor:session.actor,
        visible:true,
        state:result.state,
        nextService:serviceScheduleForMileage(result.state.mileage),
        removedMileage:result.removed,
        backupToken,
      });
    }

    if (operation === 'add-note') {
      const result = await addCarNote(body.text);
      const backupToken=await createStateBackup({previousSnapshot}).catch(()=> '');
      return res.status(200).json({
        ok:true, actor:session.actor, visible:true,
        state:result.state, note:result.note,
        nextService:serviceScheduleForMileage(result.state.mileage),
        backupToken,
      });
    }

    if (operation === 'remove-note') {
      const result = await removeCarNote(body.noteId);
      const backupToken=await createStateBackup({previousSnapshot}).catch(()=> '');
      return res.status(200).json({
        ok:true, actor:session.actor, visible:true,
        state:result.state, removedNote:result.note,
        nextService:serviceScheduleForMileage(result.state.mileage),
        backupToken,
      });
    }

    if (operation === 'restore-note') {
      const result = await restoreCarNote(body.note);
      const backupToken=await createStateBackup({previousSnapshot}).catch(()=> '');
      return res.status(200).json({
        ok:true, actor:session.actor, visible:true,
        state:result.state, note:result.note, restored:result.restored,
        nextService:serviceScheduleForMileage(result.state.mileage),
        backupToken,
      });
    }

    if (operation === 'add-task') {
      const ticktick = await createCarTask({title:body.title,date:body.date});
      return res.status(200).json({ ok:true, actor:session.actor, visible:true, ticktick });
    }

    if (operation === 'complete-task') {
      const ticktick = await completeCarTask(body.taskId);
      return res.status(200).json({ ok:true, actor:session.actor, visible:true, ticktick });
    }

    return res.status(400).json({ ok:false, error:'bad-operation' });
  } catch (error) {
    console.error('RUDI_CAR_ERROR', session.actor, operation, String(error?.message || error));
    return res.status(statusFor(error)).json({ ok:false, error:String(error?.message || error) });
  }
}

module.exports = {
  handleCarRequest,
  serviceScheduleForMileage,
  moscowDateKey,
  dayOffset,
  normalizeTitle,
  normalizeCarTaskConfig,
  normalizeCarPriorityConfig,
  carColumnIds,
  isCarTask,
  selectCurrentCarTasks,
  uniqueCarDocumentPhotos,
  cleanCarTaskTitle,
  cleanCarTaskDate,
  createCarTask,
  loadCarTasks,
};
