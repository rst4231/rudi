const crypto = require('node:crypto');
const zlib = require('node:zlib');
const { resolveTelegramBotToken } = require('./products-bought.cjs');
const { readPartnerMessage, writePartnerMessage } = require('./partner-message-store.cjs');
const { readWishlist, writeWishlist } = require('./wishlist-store.cjs');
const { readSavedItems, writeSavedItems } = require('./saved-items-store.cjs');
const { readForDiFeed, writeForDiFeed } = require('./for-di-feed-store.cjs');
const { readProductList, readProductListRaw, restoreProductListSnapshot } = require('./product-list-store.cjs');
const { readToken, saveToken } = require('./ticktick-store.cjs');
const { readCalendarUrl, saveCalendarUrl } = require('./work-calendar.cjs');
const { readAlbumConfig, saveAlbumConfig } = require('./shared-album.cjs');
const { readCycleState, writeCycleState } = require('./cycle-store.cjs');
const { readCarState, restoreCarState } = require('./car-store.cjs');
const { readDailyMoodState, restoreDailyMoodState } = require('./daily-mood-store.cjs');
const { readReactionState, restoreReactionState, mergeReactionStates } = require('./reactions-store.cjs');
const { readActivityJournal, restoreActivityJournalState } = require('./activity-journal-store.cjs');
const { readScoreState, restoreScoreState } = require('./score-store.cjs');
const { readLuluState, restoreLuluState } = require('./lulu-store.cjs');
const { readRecipients, saveRecipients, normalizeRecipients } = require('./partner-notification-store.cjs');
const { readPinRecord, restorePinRecord } = require('./rudi-session.cjs');
const { readPasskeys, restorePasskeys } = require('./rudi-passkeys.cjs');
const {
  readChecklistAuditState,
  restoreChecklistAuditState,
} = require('./ticktick-checklist-audit-store.cjs');
const { readSupplements, writeSupplements } = require('./supplements-store.cjs');
const { readHabits, writeHabits } = require('./habit-tracker-store.cjs');
const { readFastingState, writeFastingState } = require('./fasting-store.cjs');

const BACKUP_VERSION = 2;
const BACKUP_PREFIX = 'rudi-state-v2';
const MAX_BACKUP_BYTES = 2 * 1024 * 1024;

function encryptionKey(options = {}) {
  const token = options.botToken || resolveTelegramBotToken(options.env || process.env);
  return crypto.createHash('sha256').update(BACKUP_PREFIX + '\0' + String(token || '')).digest();
}

function sealSnapshot(snapshot, options = {}) {
  const raw = Buffer.from(JSON.stringify(snapshot || {}), 'utf8');
  if (!raw.length || raw.length > MAX_BACKUP_BYTES) throw new Error('rudi-backup-too-large');
  const compressed = zlib.gzipSync(raw, { level: 6 });
  const payload = compressed.length + 32 < raw.length ? compressed : raw;
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', encryptionKey(options), iv);
  const ciphertext = Buffer.concat([cipher.update(payload), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [
    BACKUP_PREFIX,
    iv.toString('base64url'),
    ciphertext.toString('base64url'),
    tag.toString('base64url'),
  ].join('.');
}

function openSnapshot(token, options = {}) {
  const value = String(token || '').trim();
  if (!value) return null;
  const parts = value.split('.');
  if (parts.length !== 4 || parts[0] !== BACKUP_PREFIX) throw new Error('rudi-backup-invalid');
  const iv = Buffer.from(parts[1], 'base64url');
  const ciphertext = Buffer.from(parts[2], 'base64url');
  const tag = Buffer.from(parts[3], 'base64url');
  if (iv.length !== 12 || tag.length !== 16 || !ciphertext.length || ciphertext.length > MAX_BACKUP_BYTES) {
    throw new Error('rudi-backup-invalid');
  }
  try {
    const decipher = crypto.createDecipheriv('aes-256-gcm', encryptionKey(options), iv);
    decipher.setAuthTag(tag);
    const payload = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
    const raw = payload.length >= 2 && payload[0] === 0x1f && payload[1] === 0x8b
      ? zlib.gunzipSync(payload)
      : payload;
    if (!raw.length || raw.length > MAX_BACKUP_BYTES) throw new Error('rudi-backup-invalid');
    const parsed = JSON.parse(raw.toString('utf8'));
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed) || Number(parsed.version) !== BACKUP_VERSION) {
      throw new Error('rudi-backup-invalid');
    }
    return parsed;
  } catch (error) {
    if (String(error?.message || error) === 'rudi-backup-invalid') throw error;
    throw new Error('rudi-backup-invalid');
  }
}

async function safeRead(task, fallback = null) {
  try { return await task(); } catch { return fallback; }
}

function newerVersionState(current, previous) {
  const a = Number(current?.version || 0);
  const b = Number(previous?.version || 0);
  if (previous?.initialized && (!current?.initialized || b > a)) return previous;
  return current || previous || null;
}

function newerTimestampState(current, previous, field) {
  if (!current) return previous || null;
  if (!previous) return current;
  const a = Date.parse(String(current?.[field] || '')) || 0;
  const b = Date.parse(String(previous?.[field] || '')) || 0;
  return b > a ? previous : current;
}

function normalizeUiPreferenceEntry(value) {
  const source=value&&typeof value==='object'&&!Array.isArray(value)?value:{};
  const order=Array.isArray(source.homeOrder)
    ? source.homeOrder.map(String).filter(Boolean).slice(0,32)
    : [];
  const rawBlocks=source.blockStates&&typeof source.blockStates==='object'&&!Array.isArray(source.blockStates)
    ? source.blockStates
    : {};
  const blockStates={};
  for(const [key,row] of Object.entries(rawBlocks)){
    if(!/^[A-Za-z0-9:_-]{1,80}$/.test(String(key))) continue;
    blockStates[String(key)]=Boolean(row);
  }
  const rawViews=source.viewStates&&typeof source.viewStates==='object'&&!Array.isArray(source.viewStates)
    ? source.viewStates
    : {};
  const viewStates={};
  for(const [key,row] of Object.entries(rawViews)){
    if(!/^[A-Za-z0-9:_-]{1,96}$/.test(String(key))) continue;
    viewStates[String(key)]=Boolean(row);
  }
  return {
    homeOrder:order,
    blockStates,
    viewStates,
    activitySeenId:String(source.activitySeenId||'').trim().slice(0,80),
    marketTickerEnabled:Object.prototype.hasOwnProperty.call(source,'marketTickerEnabled')?Boolean(source.marketTickerEnabled):true,
    themeMode:['system','light','dark'].includes(String(source.themeMode||'').trim())?String(source.themeMode).trim():'system',
    autoRefreshEnabled:Object.prototype.hasOwnProperty.call(source,'autoRefreshEnabled')?Boolean(source.autoRefreshEnabled):true,
    interfaceTextSize:['small','normal','large'].includes(String(source.interfaceTextSize||'').trim())?String(source.interfaceTextSize).trim():'normal',
    moodNotifyPartnerEnabled:Object.prototype.hasOwnProperty.call(source,'moodNotifyPartnerEnabled')?Boolean(source.moodNotifyPartnerEnabled):false,
    moodReceivePartnerEnabled:Object.prototype.hasOwnProperty.call(source,'moodReceivePartnerEnabled')?Boolean(source.moodReceivePartnerEnabled):false,
    humidityAlertEnabled:Object.prototype.hasOwnProperty.call(source,'humidityAlertEnabled')?Boolean(source.humidityAlertEnabled):true,
    morningSummaryEnabled:Object.prototype.hasOwnProperty.call(source,'morningSummaryEnabled')?Boolean(source.morningSummaryEnabled):true,
    rewardNotificationsEnabled:Object.prototype.hasOwnProperty.call(source,'rewardNotificationsEnabled')?Boolean(source.rewardNotificationsEnabled):true,
    dailyQuestionNotificationEnabled:Object.prototype.hasOwnProperty.call(source,'dailyQuestionNotificationEnabled')?Boolean(source.dailyQuestionNotificationEnabled):true,
    messengerNotificationsEnabled:Object.prototype.hasOwnProperty.call(source,'messengerNotificationsEnabled')?Boolean(source.messengerNotificationsEnabled):true,
    syncSchemaVersion:Math.max(1,Number(source.syncSchemaVersion||1)),
    updatedAt:String(source.updatedAt||''),
  };
}

function normalizeUiPreferences(value) {
  const source=value&&typeof value==='object'&&!Array.isArray(value)?value:{};
  return {
    'Рустам':normalizeUiPreferenceEntry(source['Рустам']),
    'Диана':normalizeUiPreferenceEntry(source['Диана']),
  };
}

function newerUiPreference(current, incoming) {
  const a=normalizeUiPreferenceEntry(current);
  const b=normalizeUiPreferenceEntry(incoming);
  const at=Date.parse(a.updatedAt)||0;
  const bt=Date.parse(b.updatedAt)||0;
  if(bt>at) return b;
  if(at>bt) return a;
  if(!a.updatedAt&&b.updatedAt) return b;
  return a;
}

function mergeUiPreferences(base, overlay) {
  const a=normalizeUiPreferences(base);
  const b=normalizeUiPreferences(overlay);
  return {
    'Рустам':newerUiPreference(a['Рустам'],b['Рустам']),
    'Диана':newerUiPreference(a['Диана'],b['Диана']),
  };
}

function newerPinRecord(current, previous) {
  if (!current) return previous || null;
  if (!previous) return current;
  const currentTime = Date.parse(String(current.updatedAt || '')) || 0;
  const previousTime = Date.parse(String(previous.updatedAt || '')) || 0;
  return previousTime > currentTime ? previous : current;
}

function mergePasskeyRows(current, previous) {
  const merged = new Map();
  for (const row of [...(Array.isArray(previous) ? previous : []), ...(Array.isArray(current) ? current : [])]) {
    if (!row || typeof row !== 'object') continue;
    const actor = String(row.actor || '');
    const id = String(row.id || '');
    const rpID = String(row.rpID || '');
    if (!actor || !id || !rpID) continue;
    const key = actor + '\0' + rpID + '\0' + id;
    const existing = merged.get(key);
    const existingTime = Date.parse(String(existing?.updatedAt || existing?.createdAt || '')) || 0;
    const rowTime = Date.parse(String(row.updatedAt || row.createdAt || '')) || 0;
    if (!existing || rowTime >= existingTime) merged.set(key, row);
  }
  return [...merged.values()];
}

async function createStateSnapshot(options = {}) {
  const previous = options.previousSnapshot && typeof options.previousSnapshot === 'object'
    ? options.previousSnapshot
    : null;
  const [
    partnerMessage, wishlist, products, savedItems, forDiFeed, ticktickChecklistAudit,
    ticktickToken, calendarUrl, albumConfig, cycle, carState, dailyMood, reactions, recipients, activityJournal, scoreState, luluState,
    rustamPin, dianaPin, rustamPasskeys, dianaPasskeys,
    rustamSupplements, dianaSupplements, rustamHabits, dianaHabits, rustamFasting, dianaFasting,
  ] = await Promise.all([
    safeRead(() => readPartnerMessage(options)),
    safeRead(() => readWishlist(options), { initialized: false, version: 0, items: [] }),
    safeRead(() => readProductList(options), { initialized: false, version: 0, items: [], history: [] }),
    safeRead(() => readSavedItems(options), { initialized: false, version: 0, items: [] }),
    safeRead(() => readForDiFeed(options), { initialized: false, version: 0, items: [] }),
    safeRead(() => readChecklistAuditState(options), { initialized: false, version: 0, entries: {} }),
    safeRead(() => readToken(options)),
    safeRead(() => readCalendarUrl(options)),
    safeRead(() => readAlbumConfig(options)),
    safeRead(() => readCycleState(options)),
    safeRead(() => readCarState(options)),
    safeRead(() => readDailyMoodState(options), { initialized:false, version:0, days:{} }),
    safeRead(() => readReactionState(options), { initialized:false, version:0, entries:{} }),
    safeRead(() => readRecipients(options)),
    safeRead(() => readActivityJournal(options), { initialized:false,version:0,items:[],markers:{} }),
    safeRead(() => readScoreState(options), { initialized:false,version:0,balances:{},lifetimeEarned:{},dailyEarned:{},history:[],dedupe:{} }),
    safeRead(() => readLuluState(options), { initialized:false,version:0,lastWalk:null,updatedAt:'' }),
    safeRead(() => readPinRecord('Рустам', options)),
    safeRead(() => readPinRecord('Диана', options)),
    safeRead(() => readPasskeys('Рустам', options), []),
    safeRead(() => readPasskeys('Диана', options), []),
    safeRead(() => readSupplements('Рустам', options), { initialized:false, version:0, actor:'Рустам', items:[] }),
    safeRead(() => readSupplements('Диана', options), { initialized:false, version:0, actor:'Диана', items:[] }),
    safeRead(() => readHabits('Рустам', options), { initialized:false, version:0, actor:'Рустам', habits:[] }),
    safeRead(() => readHabits('Диана', options), { initialized:false, version:0, actor:'Диана', habits:[] }),
    safeRead(() => readFastingState('Рустам', options), { initialized:false, version:0, active:null, history:[] }),
    safeRead(() => readFastingState('Диана', options), { initialized:false, version:0, active:null, history:[] }),
  ]);

  const mergedRecipients = normalizeRecipients({
    'Рустам': recipients?.['Рустам'] || previous?.recipients?.['Рустам'],
    'Диана': recipients?.['Диана'] || previous?.recipients?.['Диана'],
    candidates: [
      recipients?.['Рустам'], recipients?.['Диана'],
      previous?.recipients?.['Рустам'], previous?.recipients?.['Диана'],
    ],
  });

  return {
    version: BACKUP_VERSION,
    createdAt: new Date(options.now || Date.now()).toISOString(),
    partnerMessage: newerTimestampState(partnerMessage, previous?.partnerMessage, 'updatedAt'),
    wishlist: newerVersionState(wishlist, previous?.wishlist),
    products: newerVersionState(products, previous?.products),
    savedItems: newerVersionState(savedItems, previous?.savedItems),
    forDiFeed: newerVersionState(forDiFeed, previous?.forDiFeed),
    ticktickChecklistAudit: newerVersionState(ticktickChecklistAudit, previous?.ticktickChecklistAudit),
    ticktickToken: newerTimestampState(ticktickToken, previous?.ticktickToken, 'savedAt'),
    calendarUrl: calendarUrl || previous?.calendarUrl || '',
    albumConfig: albumConfig?.url ? albumConfig : (previous?.albumConfig || null),
    cycle: newerTimestampState(cycle, previous?.cycle, 'updatedAt'),
    carState: newerTimestampState((carState?.mileage == null && !(Array.isArray(carState?.errors) && carState.errors.length)) ? null : carState, previous?.carState, 'updatedAt'),
    dailyMood: newerVersionState(dailyMood, previous?.dailyMood),
    reactions: mergeReactionStates(previous?.reactions, reactions),
    activityJournal: newerVersionState(activityJournal, previous?.activityJournal),
    scoreState: newerVersionState(scoreState, previous?.scoreState),
    luluState: newerVersionState(luluState, previous?.luluState),
    supplements: {
      'Рустам': newerVersionState(rustamSupplements, previous?.supplements?.['Рустам']),
      'Диана': newerVersionState(dianaSupplements, previous?.supplements?.['Диана']),
    },
    habits: {
      'Рустам': newerVersionState(rustamHabits, previous?.habits?.['Рустам']),
      'Диана': newerVersionState(dianaHabits, previous?.habits?.['Диана']),
    },
    fasting: {
      'Рустам': newerVersionState(rustamFasting, previous?.fasting?.['Рустам']),
      'Диана': newerVersionState(dianaFasting, previous?.fasting?.['Диана']),
    },
    uiPreferences: normalizeUiPreferences(previous?.uiPreferences),
    recipients: mergedRecipients,
    browserAuth: {
      pins: {
        'Рустам': newerPinRecord(rustamPin, previous?.browserAuth?.pins?.['Рустам']),
        'Диана': newerPinRecord(dianaPin, previous?.browserAuth?.pins?.['Диана']),
      },
      passkeys: {
        'Рустам': mergePasskeyRows(rustamPasskeys, previous?.browserAuth?.passkeys?.['Рустам']),
        'Диана': mergePasskeyRows(dianaPasskeys, previous?.browserAuth?.passkeys?.['Диана']),
      },
    },
  };
}

async function createStateBackup(options = {}) {
  return sealSnapshot(await createStateSnapshot(options), options);
}

async function restoreStateBackup(token, options = {}) {
  const snapshot = openSnapshot(token, options);
  if (!snapshot) return { restored: [] };
  const restored = [];

  const snapshotTime = Date.parse(String(snapshot.createdAt || '')) || 0;

  const currentMessage = await safeRead(() => readPartnerMessage(options));
  const currentMessageTime = Date.parse(String(currentMessage?.updatedAt || '')) || 0;
  const savedMessageTime = Date.parse(String(snapshot.partnerMessage?.updatedAt || '')) || snapshotTime;
  if (snapshot.partnerMessage && (!currentMessage || savedMessageTime > currentMessageTime)) {
    try {
      await writePartnerMessage(snapshot.partnerMessage, options);
      restored.push('partner-message');
    } catch {}
  }

  const currentWishlist = await safeRead(() => readWishlist(options), { initialized: false, version: 0, items: [] });
  const currentWishlistVersion = Number(currentWishlist?.version || 0);
  const savedWishlistVersion = Number(snapshot.wishlist?.version || 0);
  if (
    snapshot.wishlist?.initialized &&
    (!currentWishlist?.initialized || savedWishlistVersion > currentWishlistVersion)
  ) {
    try {
      await writeWishlist(snapshot.wishlist, options);
      restored.push('wishlist');
    } catch {}
  }

  const currentProducts = await safeRead(() => readProductListRaw(options), { initialized: false, version: 0, items: [], history: [] });
  const currentProductsVersion = Number(currentProducts?.version || 0);
  const savedProductsVersion = Number(snapshot.products?.version || 0);
  if (
    snapshot.products?.initialized &&
    (!currentProducts?.initialized || savedProductsVersion > currentProductsVersion)
  ) {
    try {
      await restoreProductListSnapshot(snapshot.products, options);
      restored.push('products');
    } catch {}
  }

  const currentSavedItems = await safeRead(() => readSavedItems(options), { initialized: false, version: 0, items: [] });
  const currentSavedItemsVersion = Number(currentSavedItems?.version || 0);
  const savedItemsVersion = Number(snapshot.savedItems?.version || 0);
  if (
    snapshot.savedItems?.initialized &&
    (!currentSavedItems?.initialized || savedItemsVersion > currentSavedItemsVersion)
  ) {
    try {
      await writeSavedItems(snapshot.savedItems, options);
      restored.push('saved-items');
    } catch {}
  }

  const currentForDiFeed = await safeRead(() => readForDiFeed(options), { initialized: false, version: 0, items: [] });
  const currentForDiVersion = Number(currentForDiFeed?.version || 0);
  const savedForDiVersion = Number(snapshot.forDiFeed?.version || 0);
  if (
    snapshot.forDiFeed?.initialized &&
    (!currentForDiFeed?.initialized || savedForDiVersion > currentForDiVersion)
  ) {
    try {
      await writeForDiFeed(snapshot.forDiFeed, options);
      restored.push('for-di-feed');
    } catch {}
  }

  const currentToken = await safeRead(() => readToken(options));
  const savedTokenTime = Date.parse(String(snapshot.ticktickToken?.savedAt || '')) || snapshotTime;
  const currentTokenTime = Date.parse(String(currentToken?.savedAt || '')) || 0;
  if (snapshot.ticktickToken?.accessToken && (!currentToken?.accessToken || savedTokenTime > currentTokenTime)) {
    try {
      await saveToken(snapshot.ticktickToken, options);
      restored.push('ticktick-token');
    } catch {}
  }

  const currentCalendarUrl = await safeRead(() => readCalendarUrl(options));
  if (snapshot.calendarUrl && !currentCalendarUrl) {
    try {
      await saveCalendarUrl(snapshot.calendarUrl, options);
      restored.push('work-calendar');
    } catch {}
  }

  const currentAlbumConfig = await safeRead(() => readAlbumConfig(options));
  if (snapshot.albumConfig?.url && !currentAlbumConfig?.url) {
    try {
      await saveAlbumConfig(snapshot.albumConfig, options);
      restored.push('shared-album');
    } catch {}
  }

  const currentCycle = await safeRead(() => readCycleState(options));
  const savedCycleTime = Date.parse(String(snapshot.cycle?.updatedAt || '')) || snapshotTime;
  const currentCycleTime = Date.parse(String(currentCycle?.updatedAt || '')) || 0;
  if (snapshot.cycle && (!currentCycle || savedCycleTime > currentCycleTime)) {
    try {
      await writeCycleState(snapshot.cycle, options);
      restored.push('cycle');
    } catch {}
  }

  const currentCar = await safeRead(() => readCarState(options), { mileage:null, mileageUpdatedAt:'', errors:[], updatedAt:'' });
  const savedCarTime = Date.parse(String(snapshot.carState?.updatedAt || '')) || snapshotTime;
  const currentCarTime = Date.parse(String(currentCar?.updatedAt || '')) || 0;
  const savedCarHasData = snapshot.carState?.mileage != null || (Array.isArray(snapshot.carState?.errors) && snapshot.carState.errors.length > 0);
  const currentCarHasData = currentCar?.mileage != null || (Array.isArray(currentCar?.errors) && currentCar.errors.length > 0);
  if (
    savedCarHasData
    && (!currentCarHasData || savedCarTime > currentCarTime)
  ) {
    try {
      await restoreCarState(snapshot.carState, options);
      restored.push('car-state');
    } catch {}
  }

  const currentMood = await safeRead(
    () => readDailyMoodState(options),
    { initialized:false, version:0, days:{} }
  );
  if (
    snapshot.dailyMood?.initialized
    && (!currentMood?.initialized || Number(snapshot.dailyMood.version || 0) > Number(currentMood.version || 0))
  ) {
    try {
      await restoreDailyMoodState(snapshot.dailyMood, options);
      restored.push('daily-mood');
    } catch {}
  }

  const currentReactions = await safeRead(
    () => readReactionState(options),
    { initialized:false, version:0, entries:{} }
  );
  if (
    snapshot.reactions?.initialized
    && (!currentReactions?.initialized || Number(snapshot.reactions.version || 0) > Number(currentReactions.version || 0))
  ) {
    try {
      await restoreReactionState(snapshot.reactions, options);
      restored.push('reactions');
    } catch {}
  }

  const currentActivityJournal = await safeRead(
    () => readActivityJournal(options),
    { initialized: false, version: 0, items: [], markers: {} }
  );
  const savedActivityVersion = Number(snapshot.activityJournal?.version || 0);
  if (
    snapshot.activityJournal?.initialized &&
    (!currentActivityJournal?.initialized || savedActivityVersion > Number(currentActivityJournal?.version || 0))
  ) {
    try {
      await restoreActivityJournalState(snapshot.activityJournal, options);
      restored.push('activity-journal');
    } catch {}
  }

  const currentScore=await safeRead(()=>readScoreState(options),{initialized:false,version:0,balances:{},lifetimeEarned:{},dailyEarned:{},history:[],dedupe:{}});
  const savedScoreVersion=Number(snapshot.scoreState?.version||0);
  if(snapshot.scoreState?.initialized&&(!currentScore?.initialized||savedScoreVersion>Number(currentScore?.version||0))){
    try{await restoreScoreState(snapshot.scoreState,options);restored.push('score-state')}catch{}
  }

  const currentLulu = await safeRead(
    () => readLuluState(options),
    { initialized: false, version: 0, lastWalk: null, updatedAt: '' }
  );
  const savedLuluVersion = Number(snapshot.luluState?.version || 0);
  if (
    snapshot.luluState?.initialized &&
    (!currentLulu?.initialized || savedLuluVersion > Number(currentLulu?.version || 0))
  ) {
    try {
      await restoreLuluState(snapshot.luluState, options);
      restored.push('lulu-state');
    } catch {}
  }

  const currentRecipients = await safeRead(() => readRecipients(options));
  const mergedRecipients = {
    'Рустам': Number(currentRecipients?.['Рустам'] || snapshot.recipients?.['Рустам'] || 0) || null,
    'Диана': Number(currentRecipients?.['Диана'] || snapshot.recipients?.['Диана'] || 0) || null,
  };
  if (
    Number.isInteger(mergedRecipients['Рустам']) && mergedRecipients['Рустам'] > 0 &&
    Number.isInteger(mergedRecipients['Диана']) && mergedRecipients['Диана'] > 0 &&
    (!currentRecipients?.['Рустам'] || !currentRecipients?.['Диана'])
  ) {
    try {
      await saveRecipients(mergedRecipients, options);
      restored.push('recipients');
    } catch {}
  }

  for (const actor of ['Рустам', 'Диана']) {
    const savedPin = snapshot.browserAuth?.pins?.[actor] || null;
    if (savedPin?.salt && savedPin?.hash) {
      try {
        const currentPin = await readPinRecord(actor, options);
        const currentTime = Date.parse(String(currentPin?.updatedAt || '')) || 0;
        const savedTime = Date.parse(String(savedPin.updatedAt || '')) || 0;
        if (!currentPin || savedTime >= currentTime) {
          await restorePinRecord(actor, savedPin, options);
          restored.push('browser-pin:' + actor);
        }
      } catch {}
    }

    const savedPasskeys = Array.isArray(snapshot.browserAuth?.passkeys?.[actor])
      ? snapshot.browserAuth.passkeys[actor]
      : [];
    if (savedPasskeys.length) {
      try {
        await restorePasskeys(actor, savedPasskeys, options);
        restored.push('passkeys:' + actor);
      } catch {}
    }
  }

  for (const actor of ['Рустам', 'Диана']) {
    const savedSupplements = snapshot.supplements?.[actor];
    if (savedSupplements?.initialized) {
      const currentSupplements = await safeRead(
        () => readSupplements(actor, options),
        { initialized:false, version:0, actor, items:[] }
      );
      if (!currentSupplements?.initialized || Number(savedSupplements.version || 0) > Number(currentSupplements.version || 0)) {
        try {
          await writeSupplements(actor, savedSupplements, options);
          restored.push('supplements:' + actor);
        } catch {}
      }
    }

    const savedHabits = snapshot.habits?.[actor];
    if (savedHabits?.initialized) {
      const currentHabits = await safeRead(
        () => readHabits(actor, options),
        { initialized:false, version:0, actor, habits:[] }
      );
      if (!currentHabits?.initialized || Number(savedHabits.version || 0) > Number(currentHabits.version || 0)) {
        try {
          await writeHabits(actor, savedHabits, options);
          restored.push('habits:' + actor);
        } catch {}
      }
    }

    const savedFasting = snapshot.fasting?.[actor];
    if (savedFasting?.initialized) {
      const currentFasting = await safeRead(
        () => readFastingState(actor, options),
        { initialized:false, version:0, active:null, history:[] }
      );
      if (!currentFasting?.initialized || Number(savedFasting.version || 0) > Number(currentFasting.version || 0)) {
        try {
          await writeFastingState(actor, savedFasting, options);
          restored.push('fasting:' + actor);
        } catch {}
      }
    }
  }

  const currentChecklistAudit = await safeRead(
    () => readChecklistAuditState(options),
    { initialized: false, version: 0, entries: {} }
  );
  const currentChecklistAuditVersion = Number(currentChecklistAudit?.version || 0);
  const savedChecklistAuditVersion = Number(snapshot.ticktickChecklistAudit?.version || 0);
  if (
    snapshot.ticktickChecklistAudit?.initialized &&
    (!currentChecklistAudit?.initialized || savedChecklistAuditVersion > currentChecklistAuditVersion)
  ) {
    try {
      await restoreChecklistAuditState(snapshot.ticktickChecklistAudit, options);
      restored.push('ticktick-checklist-audit');
    } catch {}
  }

  return { restored };
}

module.exports = {
  BACKUP_VERSION,
  BACKUP_PREFIX,
  MAX_BACKUP_BYTES,
  sealSnapshot,
  openSnapshot,
  createStateSnapshot,
  createStateBackup,
  restoreStateBackup,
  normalizeUiPreferenceEntry,
  normalizeUiPreferences,
  mergeUiPreferences,
  newerPinRecord,
  mergePasskeyRows,
};
