const fs = require('node:fs');
const path = require('node:path');
const zlib = require('node:zlib');

const CHUNK_COUNT = 7;
const EXPECTED_SIZES = [9000, 9000, 9000, 9000, 9000, 9000, 7364];
const runtimeDir = path.join(__dirname, 'runtime');
const outputPath = path.join(runtimeDir, 'generated-runtime.cjs');

function replaceOnce(source, before, after, label) {
  const first = source.indexOf(before);
  if (first < 0) throw new Error(`Missing runtime patch target: ${label}`);
  if (source.indexOf(before, first + before.length) >= 0) {
    throw new Error(`Ambiguous runtime patch target: ${label}`);
  }
  return `${source.slice(0, first)}${after}${source.slice(first + before.length)}`;
}

function patchEventRuntime(source) {
  let next = source;

  next = replaceOnce(
    next,
    '  let successfulRubrics = 0;\n',
    '  let successfulRubrics = 0;\n  let concertRubricSucceeded=false;\n',
    'Yandex concert success state',
  );

  next = replaceOnce(
    next,
    '      successfulRubrics += 1;\n      for (const event of result.value) unique.set(String(event.id), event);',
    '      successfulRubrics += 1;\n      if(RELEVANT_RUBRICS[index]==="concert") concertRubricSucceeded=true;\n      for (const event of result.value) unique.set(String(event.id), event);',
    'Yandex concert success marker',
  );

  next = replaceOnce(
    next,
    '  if (successfulRubrics === 0) throw new Error("Все разделы Яндекс Афиши недоступны");',
    '  if(!concertRubricSucceeded) throw new Error("Яндекс Афиша: раздел концертов недоступен");\n  if (successfulRubrics === 0) throw new Error("Все разделы Яндекс Афиши недоступны");',
    'Yandex concert availability guard',
  );

  const digestMarker = 'async function runNextDayDigest({dateKey=moscowDateKey(),dryRun=false,replaceCurrent=true}={}){';
  const retryHelper = 'async function retryEventSource(name,load,attempts=3){\n let lastError;\n for(let attempt=1;attempt<=attempts;attempt++){\n  try{return await load();}\n  catch(error){\n   lastError=error;\n   console.warn("Event source attempt failed",{source:name,attempt,reason:error instanceof Error?error.message:"unknown error"});\n   if(attempt<attempts) await new Promise(resolve=>setTimeout(resolve,250*attempt));\n  }\n }\n throw lastError;\n}\n';
  next = replaceOnce(next, digestMarker, `${retryHelper}${digestMarker}`, 'event retry helper');

  next = replaceOnce(
    next,
    ' const [all,stage,previous,current]=await Promise.all([fetchYandexEvents(dateKey),fetchStageStandupEvents(dateKey),loadEventDigestMessageIds(previousDate),replaceCurrent?loadEventDigestMessageIds(dateKey):Promise.resolve([])]);\n const concerts=all.filter(e=>genre(e)).sort((a,b)=>(a.dates?.[0]?.start||0)-(b.dates?.[0]?.start||0));\n const messages=[concertsMessage(dateKey,concerts),stageMessage(dateKey,stage)];\n if(dryRun)return {date:dateKey,sent:false,concertCount:concerts.length,stageCount:stage.length,concerts:concerts.map(e=>({title:e.title,time:eventTimeLabel(e,dateKey),genre:genre(e),url:e.site_url})),stage:stage.map(e=>({title:e.title,time:eventTimeLabel(e,dateKey),url:e.site_url})),preview:{concerts:messages[0],stage:messages[1]}};',
    ' const [sourceResults,previous,current]=await Promise.all([Promise.allSettled([retryEventSource("yandex",()=>fetchYandexEvents(dateKey)),retryEventSource("stage",()=>fetchStageStandupEvents(dateKey))]),loadEventDigestMessageIds(previousDate),replaceCurrent?loadEventDigestMessageIds(dateKey):Promise.resolve([])]);\n const [yandexResult,stageResult]=sourceResults;\n if(yandexResult.status==="rejected") console.warn("Yandex events source failed",{reason:yandexResult.reason instanceof Error?yandexResult.reason.message:"unknown error"});\n if(stageResult.status==="rejected") console.warn("Stage events source failed",{reason:stageResult.reason instanceof Error?stageResult.reason.message:"unknown error"});\n if(yandexResult.status==="rejected"&&stageResult.status==="rejected") throw new Error(`Event sources unavailable: Yandex=${yandexResult.reason instanceof Error?yandexResult.reason.message:"unknown"}; Stage=${stageResult.reason instanceof Error?stageResult.reason.message:"unknown"}`);\n const all=yandexResult.status==="fulfilled"?yandexResult.value:[]; const stage=stageResult.status==="fulfilled"?stageResult.value:[];\n const concerts=all.filter(e=>genre(e)).sort((a,b)=>(a.dates?.[0]?.start||0)-(b.dates?.[0]?.start||0));\n const messages=[]; const preview={concerts:null,stage:null};\n if(yandexResult.status==="fulfilled"){preview.concerts=concertsMessage(dateKey,concerts);messages.push(preview.concerts);}\n if(stageResult.status==="fulfilled"){preview.stage=stageMessage(dateKey,stage);messages.push(preview.stage);}\n if(dryRun)return {date:dateKey,sent:false,concertCount:concerts.length,stageCount:stage.length,concerts:concerts.map(e=>({title:e.title,time:eventTimeLabel(e,dateKey),genre:genre(e),url:e.site_url})),stage:stage.map(e=>({title:e.title,time:eventTimeLabel(e,dateKey),url:e.site_url})),preview};',
    'digest source isolation',
  );

  return next;
}

function buildRuntime() {
  const parts = [];

  for (let index = 0; index < CHUNK_COUNT; index += 1) {
    const filePath = path.join(runtimeDir, `chunk${index}.txt`);
    if (!fs.existsSync(filePath)) {
      throw new Error(`Missing RUDI runtime chunk: chunk${index}.txt`);
    }

    const raw = fs.readFileSync(filePath, 'utf8');
    const size = Buffer.byteLength(raw, 'utf8');
    if (size !== EXPECTED_SIZES[index]) {
      throw new Error(`Unexpected size for chunk${index}.txt: ${size}, expected ${EXPECTED_SIZES[index]}`);
    }

    parts.push(raw.trim());
  }

  const compressed = Buffer.from(parts.join(''), 'base64');
  const code = patchEventRuntime(zlib.gunzipSync(compressed).toString('utf8'));
  fs.writeFileSync(outputPath, code);
  return { outputPath, bytes: Buffer.byteLength(code) };
}

if (require.main === module) {
  const result = buildRuntime();
  console.log(`RUDI runtime built locally: ${result.bytes} bytes`);
}

module.exports = { buildRuntime, CHUNK_COUNT, EXPECTED_SIZES, patchEventRuntime };
