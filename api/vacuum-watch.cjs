const { appendActivity } = require('./activity-journal-store.cjs');
const { readSmartHomeSnapshot, readSmartHomeDeviceStatus } = require('./smart-home-client.cjs');
const {
  readVacuumWatchState,
  writeVacuumWatchState,
} = require('./vacuum-watch-store.cjs');

const MANUAL_GRACE_MS = 15 * 60 * 1000;
const MIN_FINISH_AFTER_START_MS = 5 * 60 * 1000;

function ts(value) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : 0;
}

function cap(device, type, instance) {
  return (device?.capabilities || []).find(item =>
    item?.type === type &&
    String(item?.state?.instance || item?.parameters?.instance || '') === String(instance || '')
  ) || null;
}

function prop(device, instance) {
  return (device?.properties || []).find(item =>
    String(item?.state?.instance || item?.parameters?.instance || '') === String(instance || '')
  ) || null;
}

function findVacuum(home) {
  return (home?.devices || []).find(device =>
    /vacuum_cleaner/i.test(String(device?.type || '')) ||
    /пылесос|vacuum/i.test(String(device?.name || ''))
  ) || null;
}

function snapshotOf(device) {
  const power = cap(device, 'devices.capabilities.on_off', 'on');
  const pause = cap(device, 'devices.capabilities.toggle', 'pause');
  const speed = cap(device, 'devices.capabilities.mode', 'work_speed');
  const cleanup = cap(device, 'devices.capabilities.mode', 'cleanup_mode');
  const battery = prop(device, 'battery_level');

  const batteryValue = Number(battery?.state?.value);
  const controlSignature = [
    power?.state?.value === true ? 'on:1' : power?.state?.value === false ? 'on:0' : 'on:x',
    pause?.state?.value === true ? 'pause:1' : pause?.state?.value === false ? 'pause:0' : 'pause:x',
    'speed:' + String(speed?.state?.value ?? ''),
    'cleanup:' + String(cleanup?.state?.value ?? ''),
  ].join('|');

  return {
    battery:Number.isFinite(batteryValue) ? batteryValue : null,
    batteryUpdated:ts(battery?.lastUpdated),
    controlUpdated:Math.max(
      ts(power?.lastUpdated),
      ts(pause?.lastUpdated),
      ts(speed?.lastUpdated),
      ts(cleanup?.lastUpdated)
    ),
    controlSignature,
    power:typeof power?.state?.value === 'boolean' ? power.state.value : null,
    paused:typeof pause?.state?.value === 'boolean' ? pause.state.value : null,
    online:String(device?.state || '') !== 'offline',
  };
}

function elapsedSince(value, nowMs) {
  const parsed = Date.parse(String(value || ''));
  return Number.isFinite(parsed) ? Math.max(0, nowMs - parsed) : Infinity;
}

async function runVacuumWatch(options = {}) {
  const nowMs = Number(options.now || Date.now());
  const nowIso = new Date(nowMs).toISOString();
  const readHome = options.readHome || readSmartHomeSnapshot;
  const readDevice = options.readDevice || readSmartHomeDeviceStatus;
  const append = options.appendActivity || appendActivity;

  const home = await readHome(true);
  const listed = findVacuum(home);
  if (!listed?.id) return { found:false, event:null };

  const device = await readDevice(listed.id).catch(() => listed);
  const current = snapshotOf(device);
  const previous = await readVacuumWatchState(options);

  const base = {
    ...previous,
    initialized:true,
    vacuumId:String(device?.id || listed.id),
    vacuumName:String(device?.name || listed.name || 'Пылесос'),
    lastBattery:current.battery,
    lastBatteryUpdated:current.batteryUpdated,
    lastControlUpdated:current.controlUpdated,
    lastControlSignature:current.controlSignature,
    lastSeenAt:nowIso,
  };

  if (!previous.initialized || previous.vacuumId !== base.vacuumId) {
    await writeVacuumWatchState({
      ...base,
      active:false,
      activeOrigin:'',
      activeSince:'',
    }, options);
    return { found:true, event:null, initialized:true };
  }

  const batteryDrop = previous.lastBattery != null && current.battery != null && current.battery <= previous.lastBattery - 1;
  const batteryRise = previous.lastBattery != null && current.battery != null && current.battery >= previous.lastBattery + 1;
  const controlChanged = Boolean(current.controlSignature) && current.controlSignature !== previous.lastControlSignature;
  const controlAdvanced = current.controlUpdated > Number(previous.lastControlUpdated || 0);
  const runnable = current.online && current.power !== false && current.paused !== true;
  const manualRecent = elapsedSince(previous.lastManualAt, nowMs) <= MANUAL_GRACE_MS;

  let next = { ...base };
  let event = null;

  if (!previous.active && runnable && (batteryDrop || (controlChanged && controlAdvanced))) {
    const origin = manualRecent ? 'manual' : 'scheduled';
    next.active = true;
    next.activeOrigin = origin;
    next.activeSince = nowIso;
    next.lastStartAt = nowIso;

    if (origin === 'scheduled') {
      await append({
        type:'smart-home',
        text:'Пылесос начал уборку по расписанию',
        icon:'🧹',
        targetTab:'home',
        dedupeKey:'vacuum-start:' + nowIso.slice(0,16),
      }, options);
      event = 'started';
    }
  } else if (previous.active) {
    const activeFor = elapsedSince(previous.activeSince, nowMs);
    const finished = current.power === false || (batteryRise && activeFor >= MIN_FINISH_AFTER_START_MS);
    if (finished) {
      next.active = false;
      next.activeOrigin = '';
      next.activeSince = '';
      next.lastFinishAt = nowIso;

      if (previous.activeOrigin === 'scheduled') {
        await append({
          type:'smart-home',
          text:'Пылесос завершил уборку',
          icon:'🧹',
          targetTab:'home',
          dedupeKey:'vacuum-finish:' + nowIso.slice(0,16),
        }, options);
        event = 'finished';
      }
    }
  }

  await writeVacuumWatchState(next, options);
  return {
    found:true,
    event,
    active:Boolean(next.active),
    origin:next.activeOrigin || '',
    battery:current.battery,
  };
}

module.exports = {
  MANUAL_GRACE_MS,
  MIN_FINISH_AFTER_START_MS,
  findVacuum,
  snapshotOf,
  runVacuumWatch,
};
