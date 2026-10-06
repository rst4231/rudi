const crypto = require('node:crypto');
const { createStrictRuntimeCache } = require('./strict-runtime-cache.cjs');

const NAMESPACE = 'rudi-shared-album-v1';
const CONFIG_KEY = 'album-config';
const CACHE_KEY = 'album-latest';
const CONFIG_TTL_SECONDS = 60 * 60 * 24 * 3650;
const DATA_TTL_SECONDS = 60 * 15;
const FRESH_CACHE_MS = 60 * 1000;
const PREVIEW_MAX_EDGE = 640;
const VIEWER_MAX_EDGE = null;
const EXPECTED_SETUP_SHA256 = '89bb9543fa407ae3542bdf4f1b63578e827933ae4583eb032b1d9f29add5cf80';
const BASE62 = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz';

function cacheOf(options = {}) {
  return options.albumCache || options.cache || createStrictRuntimeCache({ namespace: NAMESPACE });
}

function sha256(value) {
  return crypto.createHash('sha256').update(String(value || '')).digest('hex');
}

function extractToken(value) {
  const raw = String(value || '').trim();
  const modern = raw.match(/^https:\/\/photos\.icloud\.com\/shared\/album\/([A-Za-z0-9_-]+)(?:[/?#].*)?$/i);
  if (modern) return modern[1];
  const hash = raw.match(/#([A-Za-z0-9_-]+)$/);
  if (hash) return hash[1];
  if (/^[A-Za-z0-9_-]+$/.test(raw)) return raw;
  throw new Error('shared-album-invalid');
}

function normalizeAlbumUrl(value) {
  const raw = String(value || '').trim();
  if (/^https:\/\/www\.icloud\.com\/sharedalbum\/#([A-Za-z0-9_-]+)$/i.test(raw)) return raw;
  const modern = raw.match(/^https:\/\/photos\.icloud\.com\/shared\/album\/([A-Za-z0-9_-]+)(?:[/?#].*)?$/i);
  if (modern) return 'https://photos.icloud.com/shared/album/' + modern[1];
  throw new Error('shared-album-invalid');
}

function decodeSetupKey(value) {
  const key = String(value || '').trim();
  if (!key) throw new Error('shared-album-setup-key-required');
  let raw;
  try { raw = Buffer.from(key, 'base64url').toString('utf8'); }
  catch { throw new Error('shared-album-setup-key-invalid'); }
  if (sha256(raw) !== EXPECTED_SETUP_SHA256) throw new Error('shared-album-setup-key-invalid');
  const url = normalizeAlbumUrl(raw);
  return { url, token: extractToken(url) };
}

async function saveAlbumConfig(config, options = {}) {
  const row = { url: normalizeAlbumUrl(config.url), token: extractToken(config.token || config.url) };
  await cacheOf(options).set(CONFIG_KEY, row, { ttl: CONFIG_TTL_SECONDS, tags: ['rudi-shared-album'] });
  return row;
}

async function readAlbumConfig(options = {}) {
  const row = await cacheOf(options).get(CONFIG_KEY);
  if (!row?.url || !row?.token) return null;
  return { url: normalizeAlbumUrl(row.url), token: extractToken(row.token) };
}

function base62ToInt(value) {
  let result = 0;
  for (const char of String(value || '')) {
    const index = BASE62.indexOf(char);
    if (index < 0) throw new Error('shared-album-token-invalid');
    result = result * 62 + index;
  }
  return result;
}

function initialHost(token) {
  const prefix = token[0] === 'A' ? token.slice(1, 2) : token.slice(1, 3);
  const part = base62ToInt(prefix);
  return `p${String(part).padStart(2, '0')}-sharedstreams.icloud.com`;
}

async function postICloud(host, token, endpoint, body, options = {}) {
  const fetchImpl = options.fetchImpl || globalThis.fetch;
  const url = `https://${host}/${token}/sharedstreams/${endpoint}`;
  const response = await fetchImpl(url, {
    method: 'POST',
    headers: {
      'content-type': 'text/plain',
      'cache-control': 'no-cache',
      'user-agent': 'Photos/5.0 (Macintosh; OS X 10.15.4) AppleWebKit/605.1.15',
    },
    body: JSON.stringify(body),
  });

  if (response.status === 330) {
    const payload = await response.json().catch(() => ({}));
    const nextHost = String(payload?.['X-Apple-MMe-Host'] || response.headers?.get?.('x-apple-mme-host') || '').trim();
    if (!nextHost || nextHost === host) throw new Error('shared-album-redirect-invalid');
    return postICloud(nextHost, token, endpoint, body, options);
  }

  if (!response.ok) throw new Error(`shared-album-http-${response.status}`);
  const payload = await response.json();
  const payloadHost = String(payload?.['X-Apple-MMe-Host'] || '').trim();
  if (endpoint === 'webstream' && payloadHost && payloadHost !== host) {
    return postICloud(payloadHost, token, endpoint, body, options);
  }
  return { payload, host };
}

function photoDate(photo) {
  const raw = String(photo?.batchDateCreated || photo?.dateCreated || '');
  const time = Date.parse(raw);
  return Number.isFinite(time) ? time : 0;
}

function photoLocationMetadata(photo) {
  const source = photo?.location && typeof photo.location === 'object'
    ? photo.location
    : (photo?.locationInfo && typeof photo.locationInfo === 'object' ? photo.locationInfo : {});
  const candidates = [
    photo?.locationName,
    source?.name,
    source?.label,
    source?.formattedAddress,
    source?.address,
    source?.locality,
    source?.city,
  ].filter((value) => typeof value === 'string' && value.trim());
  const latitude = Number(source?.latitude ?? source?.lat ?? photo?.latitude);
  const longitude = Number(source?.longitude ?? source?.lon ?? source?.lng ?? photo?.longitude);
  return {
    label: candidates.length ? String(candidates[0]).trim() : '',
    latitude: Number.isFinite(latitude) ? latitude : null,
    longitude: Number.isFinite(longitude) ? longitude : null,
  };
}

function derivativeScore(item) {
  const width = Number(item?.width || 0);
  const height = Number(item?.height || 0);
  const pixels = width > 0 && height > 0 ? width * height : 0;
  return [pixels, Number(item?.fileSize || 0)];
}

function pickDerivative(photo) {
  const values = Object.values(photo?.derivatives || {}).filter((item) => item && item.checksum);
  if (!values.length) return null;

  const withSize = values.map((item) => ({
    item,
    width: Number(item.width || 0),
    height: Number(item.height || 0),
    bytes: Number(item.fileSize || 0),
  }));
  const previews = withSize
    .filter((row) => row.width > 0 && row.height > 0 && Math.max(row.width, row.height) <= PREVIEW_MAX_EDGE)
    .sort((a, b) => (b.width * b.height) - (a.width * a.height) || b.bytes - a.bytes);
  if (previews.length) return previews[0].item;

  const smallest = withSize
    .filter((row) => row.width > 0 && row.height > 0)
    .sort((a, b) => (a.width * a.height) - (b.width * b.height) || a.bytes - b.bytes);
  return smallest[0]?.item || values[0];
}

function pickViewerDerivative(photo) {
  const values = Object.values(photo?.derivatives || {}).filter((item) => item && item.checksum);
  if (!values.length) return null;
  const rows = values.map((item) => ({
    item,
    width: Number(item.width || 0),
    height: Number(item.height || 0),
    bytes: Number(item.fileSize || 0),
  }));
  const sized = rows
    .filter((row) => row.width > 0 && row.height > 0)
    .sort((a, b) => (b.width * b.height) - (a.width * a.height) || b.bytes - a.bytes);
  if (sized.length) return sized[0].item;
  return rows.sort((a, b) => b.bytes - a.bytes)[0]?.item || values[0];
}


function derivativeEntries(photo) {
  return Object.entries(photo?.derivatives || {})
    .filter(([, item]) => item && item.checksum)
    .map(([key, item]) => ({ key: String(key || ''), item }));
}

function looksLikeVideoDerivative(key, item) {
  const value = [key, item?.mimeType, item?.contentType, item?.type, item?.format]
    .filter(Boolean).join(' ').toLowerCase();
  return /video|mov|mp4|m4v|360p|540p|720p|1080p/.test(value);
}

function looksLikePosterDerivative(key, item) {
  const value = [key, item?.mimeType, item?.contentType, item?.type, item?.format]
    .filter(Boolean).join(' ').toLowerCase();
  return /poster|frame|thumb|image|jpeg|jpg|heic|png/.test(value)
    && !looksLikeVideoDerivative(key, item);
}

function pickVideoPosterDerivative(photo) {
  const rows = derivativeEntries(photo)
    .filter(({ key, item }) => looksLikePosterDerivative(key, item))
    .map(({ item }) => ({
      item,
      width: Number(item.width || 0),
      height: Number(item.height || 0),
      bytes: Number(item.fileSize || 0),
    }));
  if (!rows.length) return null;
  const preferred = rows
    .filter((row) => row.width > 0 && row.height > 0 && Math.max(row.width, row.height) <= PREVIEW_MAX_EDGE)
    .sort((a, b) => (b.width * b.height) - (a.width * a.height) || b.bytes - a.bytes);
  return preferred[0]?.item
    || rows.sort((a, b) => (a.width * a.height) - (b.width * b.height) || a.bytes - b.bytes)[0]?.item
    || null;
}

function videoDerivativeRows(photo) {
  return derivativeEntries(photo)
    .filter(({ key, item }) => looksLikeVideoDerivative(key, item))
    .map(({ key, item }) => ({
      key,
      item,
      width: Number(item.width || 0),
      height: Number(item.height || 0),
      bytes: Number(item.fileSize || 0),
      mimeType: String(item?.mimeType || item?.contentType || '').trim(),
    }))
    .sort((a, b) => {
      const rank = (row) => {
        const key = row.key.toLowerCase();
        if (/360p/.test(key)) return 0;
        if (/540p/.test(key)) return 1;
        if (/720p/.test(key)) return 2;
        if (/1080p/.test(key)) return 3;
        return 4;
      };
      return rank(a) - rank(b) || a.bytes - b.bytes;
    });
}

function pickVideoDerivative(photo) {
  return videoDerivativeRows(photo)[0]?.item || null;
}

function videoSources(photo, assetData) {
  const seen = new Set();
  return videoDerivativeRows(photo)
    .map((row) => {
      const url = assetUrl(assetData, row.item?.checksum || '');
      if (!url || seen.has(url)) return null;
      seen.add(url);
      return {
        url,
        type: row.mimeType || 'video/mp4',
        label: row.key,
        width: row.width || null,
        height: row.height || null,
      };
    })
    .filter(Boolean);
}

function assetUrl(assetData, checksum) {
  const item = assetData?.items?.[checksum];
  if (!item) return '';
  const location = assetData?.locations?.[item.url_location];
  const scheme = String(location?.scheme || 'https');
  const host = String(location?.hosts?.[0] || item.url_location || '');
  const path = String(item.url_path || '');
  if (!host || !path) return '';
  return `${scheme}://${host}${path}`;
}


const CLOUDKIT_RESOLVE_HOST = 'https://ckdatabasews.icloud.com';
const CLOUDKIT_CONTAINER = 'com.apple.photos.cloud';
const CLOUDKIT_BUILD = '2626';
const CLOUDKIT_RECORD_TYPE = 'CPLAssetAndMasterByAssetDateWithoutHiddenOrDeleted';
const CLOUDKIT_PAGE_SIZE = 200;
const CLOUDKIT_HEADERS = {
  'content-type':'text/plain',
  origin:'https://www.icloud.com',
  referer:'https://www.icloud.com/',
  accept:'application/json',
};

function isCloudKitAlbumUrl(value) {
  return /^https:\/\/photos\.icloud\.com\/shared\/album\/[A-Za-z0-9_-]+$/i.test(String(value||'').trim());
}

function cloudKitField(fields,name) {
  const field=fields&&typeof fields==='object'?fields[name]:null;
  return field&&typeof field==='object'?field.value:null;
}

function cloudKitFilename(fields) {
  const raw=cloudKitField(fields,'filenameEnc');
  if(typeof raw!=='string'||!raw) return 'image';
  try{return Buffer.from(raw,'base64').toString('utf8')||'image'}catch{return 'image'}
}

function cloudKitDownloadUrl(value,filename='image') {
  const raw=String(value||'').trim();
  if(!raw) return '';
  return raw.replace(/\$\{f\}/g,encodeURIComponent(String(filename||'image')));
}

function cloudKitResource(fields,key,widthKey,heightKey) {
  const resource=fields&&typeof fields==='object'?fields[key]:null;
  const value=resource&&typeof resource==='object'?resource.value:null;
  const url=cloudKitDownloadUrl(value?.downloadURL,cloudKitFilename(fields));
  if(!url) return null;
  return {
    url,
    width:Number(cloudKitField(fields,widthKey)||0)||null,
    height:Number(cloudKitField(fields,heightKey)||0)||null,
  };
}

function cloudKitImageResources(fields) {
  return [
    cloudKitResource(fields,'resJPEGThumbRes','resJPEGThumbWidth','resJPEGThumbHeight'),
    cloudKitResource(fields,'resJPEGMedRes','resJPEGMedWidth','resJPEGMedHeight'),
    cloudKitResource(fields,'resJPEGLargeRes','resJPEGLargeWidth','resJPEGLargeHeight'),
    cloudKitResource(fields,'resJPEGFullRes','resJPEGFullWidth','resJPEGFullHeight'),
  ].filter(Boolean);
}

function cloudKitIsVideo(fields) {
  const type=String(cloudKitField(fields,'itemType')||'').toLowerCase();
  return /movie|video|mpeg-4|quicktime/.test(type);
}

function cloudKitDate(value) {
  const raw=Number(value);
  if(!Number.isFinite(raw)||raw<=0) return '';
  const ms=raw<1e12?raw*1000:raw;
  const date=new Date(ms);
  return Number.isNaN(date.getTime())?'':date.toISOString();
}

async function postCloudKit(url,body,options={}) {
  const fetchImpl=options.fetchImpl||globalThis.fetch;
  const response=await fetchImpl(url,{
    method:'POST',
    headers:CLOUDKIT_HEADERS,
    body:JSON.stringify(body),
    cache:'no-store',
  });
  if(!response.ok) throw new Error('shared-album-cloudkit-http-'+response.status);
  return response.json();
}

async function resolveCloudKitAlbum(token,options={}) {
  const query=[
    'remapEnums=true',
    'getCurrentSyncToken=true',
    'sharing_url_key='+encodeURIComponent(token),
  ].join('&');
  const url=CLOUDKIT_RESOLVE_HOST
    +'/database/1/'+CLOUDKIT_CONTAINER+'/production/public/records/resolve?'+query;
  const payload=await postCloudKit(url,{shortGUIDs:[{value:token,shouldFetchRootRecord:true}]},options);
  const result=Array.isArray(payload?.results)?payload.results[0]:null;
  if(result?.serverErrorCode) throw new Error('shared-album-cloudkit-'+String(result.serverErrorCode).toLowerCase());
  if(result?.requireAppleLogin) throw new Error('shared-album-cloudkit-private');
  const zone=result?.zoneID;
  const access=result?.anonymousPublicAccess;
  const accessToken=String(access?.token||'').trim();
  const partition=String(access?.databasePartition||'').trim().replace(/\/+$/,'');
  if(
    !zone
    || !accessToken
    || !/^https:\/\/[A-Za-z0-9.-]+\.icloud\.com(?::\d+)?$/i.test(partition)
  ) throw new Error('shared-album-cloudkit-private');
  const title=String(cloudKitField(result?.share?.fields,'cloudkit.title')||'Общий альбом').trim()||'Общий альбом';
  return {zone,accessToken,partition,title};
}

function parseCloudKitPhotos(records) {
  const latestRecords=new Map();
  for(const record of Array.isArray(records)?records:[]){
    const name=String(record?.recordName||'').trim();
    if(!name) continue;
    const deleted=record?.deleted===true||record?.isDeleted===true||record?.recordType==='CPLDeletedRecord';
    if(deleted){latestRecords.delete(name);continue}
    latestRecords.set(name,record);
  }
  const masters=new Map(),assets=[];
  for(const record of latestRecords.values()){
    if(record?.recordType==='CPLMaster') masters.set(String(record.recordName||''),record.fields||{});
    else if(record?.recordType==='CPLAsset') assets.push(record);
  }
  const photos=[];
  const seen=new Set();
  for(const asset of assets){
    const fields=asset?.fields||{};
    if(cloudKitField(fields,'isHidden')||cloudKitField(fields,'trashReason')) continue;
    const masterName=String(fields?.masterRef?.value?.recordName||'').trim();
    const masterFields=masters.get(masterName);
    if(!masterName||!masterFields||seen.has(masterName)||cloudKitIsVideo(masterFields)) continue;
    const jpgs=cloudKitImageResources(masterFields);
    const original=cloudKitResource(masterFields,'resOriginalRes','resOriginalWidth','resOriginalHeight');
    const preview=jpgs[0]||original;
    const full=jpgs[jpgs.length-1]||original||preview;
    if(!preview?.url) continue;
    seen.add(masterName);
    photos.push({
      id:masterName,
      type:'image',
      url:preview.url,
      fullUrl:full?.url||preview.url,
      originalUrl:original?.url||full?.url||preview.url,
      width:preview.width,
      height:preview.height,
      fullWidth:full?.width||preview.width,
      fullHeight:full?.height||preview.height,
      originalWidth:original?.width||full?.width||preview.width,
      originalHeight:original?.height||full?.height||preview.height,
      date:cloudKitDate(cloudKitField(fields,'assetDate')),
      caption:'',
      location:'',
      latitude:null,
      longitude:null,
    });
  }
  return photos.sort((a,b)=>Date.parse(b.date||0)-Date.parse(a.date||0));
}

async function fetchCloudKitPhotos(config,options={}) {
  const token=String(config?.token||extractToken(config?.url)||'').trim();
  const resolved=await resolveCloudKitAlbum(token,options);
  const query=[
    'remapEnums=true',
    'getCurrentSyncToken=true',
    'sharing_url_key='+encodeURIComponent(token),
    'publicAccessAuthToken='+encodeURIComponent(resolved.accessToken),
  ].join('&');
  const url=resolved.partition
    +'/database/1/'+CLOUDKIT_CONTAINER+'/production/shared/changes/zone?'+query;
  const records=[];
  let syncToken='';
  for(let page=0;page<100&&records.length<20000;page++){
    const zone={zoneID:resolved.zone,resultsLimit:CLOUDKIT_PAGE_SIZE};
    if(syncToken) zone.syncToken=syncToken;
    const payload=await postCloudKit(url,{zones:[zone]},options);
    const result=Array.isArray(payload?.zones)?payload.zones[0]:null;
    if(!result) throw new Error('shared-album-cloudkit-zone-missing');
    if(result?.serverErrorCode) throw new Error('shared-album-cloudkit-'+String(result.serverErrorCode).toLowerCase());
    const batch=Array.isArray(result?.records)?result.records:[];
    records.push(...batch);
    syncToken=String(result?.syncToken||'');
    if(!result?.moreComing) break;
    if(!syncToken&&!batch.length) break;
  }

  const photos=parseCloudKitPhotos(records);
  return {
    photos,
    totalCount:photos.length,
    albumUrl:config.url,
    title:resolved.title,
  };
}

async function fetchLatestPhotos(config, options = {}) {
  if(isCloudKitAlbumUrl(config?.url)) return fetchCloudKitPhotos(config,options);
  const token = config.token;
  let host = initialHost(token);
  const streamResult = await postICloud(host, token, 'webstream', { streamCtag: null }, options);
  host = streamResult.host;
  const allPhotos = (Array.isArray(streamResult.payload?.photos) ? streamResult.payload.photos : [])
    .filter((photo) => photo?.photoGuid)
    .sort((a, b) => photoDate(b) - photoDate(a));
  const totalCount = allPhotos.length;
  const photos = allPhotos.slice(0, 250);

  if (!photos.length) return {
    photos: [],
    totalCount,
    albumUrl: config.url,
    title: String(streamResult.payload?.streamName || 'Общий альбом'),
  };

  const assetResult = await postICloud(host, token, 'webasseturls', { photoGuids: photos.map((p) => p.photoGuid) }, options);
  const result = photos.map((photo) => {
    const isVideo = String(photo?.mediaAssetType || '').toLowerCase() === 'video';
    const derivative = isVideo ? pickVideoPosterDerivative(photo) : pickDerivative(photo);
    const fullDerivative = isVideo ? derivative : (pickViewerDerivative(photo) || derivative);
    const sources = isVideo ? videoSources(photo, assetResult.payload) : [];
    const videoDerivative = isVideo ? pickVideoDerivative(photo) : null;
    const checksum = derivative?.checksum || '';
    const fullChecksum = fullDerivative?.checksum || checksum;
    const location = photoLocationMetadata(photo);
    const url = assetUrl(assetResult.payload, checksum);
    return {
      id: String(photo.photoGuid),
      type: isVideo ? 'video' : 'image',
      url,
      fullUrl: assetUrl(assetResult.payload, fullChecksum) || url,
      videoUrl: isVideo ? (sources[0]?.url || assetUrl(assetResult.payload, videoDerivative?.checksum || '')) : '',
      videoSources: sources,
      width: Number(derivative?.width || photo.width || 0) || null,
      height: Number(derivative?.height || photo.height || 0) || null,
      fullWidth: Number(fullDerivative?.width || photo.width || 0) || null,
      fullHeight: Number(fullDerivative?.height || photo.height || 0) || null,
      date: String(photo.batchDateCreated || photo.dateCreated || ''),
      caption: String(photo.caption || '').trim(),
      location: location.label,
      latitude: location.latitude,
      longitude: location.longitude,
    };
  }).filter((photo) => photo.url && (photo.type !== 'video' || photo.videoUrl));

  return {
    photos: result,
    totalCount,
    albumUrl: config.url,
    title: String(streamResult.payload?.streamName || 'Общий альбом').trim() || 'Общий альбом',
  };
}

async function getLatestPhotos(options = {}) {
  const cache = cacheOf(options);
  const config = options.albumConfig?.url ? { url: normalizeAlbumUrl(options.albumConfig.url), token: extractToken(options.albumConfig.token || options.albumConfig.url) } : await readAlbumConfig({ ...options, albumCache: cache });
  if (!config) return { configured: false, photos: [], totalCount: 0, albumUrl: null, title: 'Общий альбом' };

  const cached = await cache.get(CACHE_KEY).catch(() => null);
  const now = Number(options.now || Date.now());
  const cachedAt = Date.parse(String(cached?.updatedAt || ''));
  if (cached?.photos && Number.isFinite(cachedAt) && now >= cachedAt && now - cachedAt < FRESH_CACHE_MS) {
    return { ...cached, configured: true, cached: true };
  }
  try {
    const fresh = await fetchLatestPhotos(config, options);
    const result = { configured: true, ...fresh, updatedAt: new Date(now).toISOString() };
    await cache.set(CACHE_KEY, result, { ttl: DATA_TTL_SECONDS, tags: ['rudi-shared-album'] }).catch(() => false);
    return result;
  } catch (error) {
    if (cached?.photos) return { ...cached, configured: true, stale: true };
    throw error;
  }
}

module.exports = {
  DATA_TTL_SECONDS,
  FRESH_CACHE_MS,
  PREVIEW_MAX_EDGE,
  VIEWER_MAX_EDGE,
  decodeSetupKey,
  saveAlbumConfig,
  readAlbumConfig,
  initialHost,
  pickDerivative,
  pickViewerDerivative,
  pickVideoPosterDerivative,
  pickVideoDerivative,
  videoSources,
  fetchLatestPhotos,
  fetchCloudKitPhotos,
  parseCloudKitPhotos,
  getLatestPhotos,
};
