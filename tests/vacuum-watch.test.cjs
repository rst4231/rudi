const test = require('node:test');
const assert = require('node:assert/strict');
const {
  runVacuumWatch,
} = require('../api/vacuum-watch.cjs');
const {
  markVacuumManualAction,
  resetMutationQueueForTests,
} = require('../api/vacuum-watch-store.cjs');

function memoryCache() {
  const map = new Map();
  return {
    async get(key) { return map.has(key) ? structuredClone(map.get(key)) : null; },
    async set(key, value) { map.set(key, structuredClone(value)); return true; },
  };
}

function home() {
  return {
    devices:[{
      id:'vacuum-12345678',
      name:'Робот пылесос',
      type:'devices.types.vacuum_cleaner',
    }],
  };
}

function device({ battery, batteryUpdated, controlUpdated, power=true, pause=false, speed='medium' }) {
  return {
    id:'vacuum-12345678',
    name:'Робот пылесос',
    type:'devices.types.vacuum_cleaner',
    state:'online',
    capabilities:[
      { type:'devices.capabilities.on_off', state:{instance:'on',value:power}, lastUpdated:controlUpdated },
      { type:'devices.capabilities.toggle', state:{instance:'pause',value:pause}, lastUpdated:controlUpdated },
      { type:'devices.capabilities.mode', state:{instance:'work_speed',value:speed}, lastUpdated:controlUpdated },
    ],
    properties:[
      { type:'devices.properties.float', state:{instance:'battery_level',value:battery}, lastUpdated:batteryUpdated },
    ],
  };
}

test('scheduled vacuum lifecycle adds start and finish once', async () => {
  resetMutationQueueForTests();
  const cache=memoryCache();
  const events=[];
  let current=device({battery:100,batteryUpdated:100,controlUpdated:100});
  const opts={
    cache,
    readHome:async()=>home(),
    readDevice:async()=>current,
    appendActivity:async item=>events.push(item),
  };

  await runVacuumWatch({...opts,now:1_000_000});
  current=device({battery:99,batteryUpdated:200,controlUpdated:200});
  const started=await runVacuumWatch({...opts,now:1_600_000});
  assert.equal(started.event,'started');
  assert.equal(events.length,1);
  assert.equal(events[0].text,'Пылесос начал уборку по расписанию');

  current=device({battery:98,batteryUpdated:300,controlUpdated:200});
  await runVacuumWatch({...opts,now:2_000_000});
  assert.equal(events.length,1);

  current=device({battery:99,batteryUpdated:400,controlUpdated:200});
  const finished=await runVacuumWatch({...opts,now:2_300_000});
  assert.equal(finished.event,'finished');
  assert.equal(events.length,2);
  assert.equal(events[1].text,'Пылесос завершил уборку');

  await runVacuumWatch({...opts,now:2_900_000});
  assert.equal(events.length,2);
});

test('manual RUDI vacuum run is not labeled as scheduled', async () => {
  resetMutationQueueForTests();
  const cache=memoryCache();
  const events=[];
  let current=device({battery:100,batteryUpdated:100,controlUpdated:100});
  const opts={
    cache,
    readHome:async()=>home(),
    readDevice:async()=>current,
    appendActivity:async item=>events.push(item),
  };

  await runVacuumWatch({...opts,now:1_000_000});
  await markVacuumManualAction({cache,now:1_100_000,source:'switch'});
  current=device({battery:99,batteryUpdated:200,controlUpdated:200});
  const started=await runVacuumWatch({...opts,now:1_200_000});
  assert.equal(started.event,null);
  assert.equal(started.origin,'manual');
  assert.equal(events.length,0);

  current=device({battery:100,batteryUpdated:300,controlUpdated:200});
  const finished=await runVacuumWatch({...opts,now:1_700_000});
  assert.equal(finished.event,null);
  assert.equal(events.length,0);
});

test('battery rise while idle does not create a false cleaning event', async () => {
  resetMutationQueueForTests();
  const cache=memoryCache();
  const events=[];
  let current=device({battery:95,batteryUpdated:100,controlUpdated:100});
  const opts={
    cache,
    readHome:async()=>home(),
    readDevice:async()=>current,
    appendActivity:async item=>events.push(item),
  };

  await runVacuumWatch({...opts,now:1_000_000});
  current=device({battery:96,batteryUpdated:200,controlUpdated:100});
  const result=await runVacuumWatch({...opts,now:1_600_000});
  assert.equal(result.event,null);
  assert.equal(result.active,false);
  assert.equal(events.length,0);
});
