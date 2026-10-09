'use strict';
// Fixed domain allowlist: wallet names and user-supplied URLs can never become fetch targets.
const { brands } = require('../public/wallet-brand-icons.js');
const DOMAINS = new Map(brands.map(brand => [brand.id, brand.domain]));
const MAX_BYTES = 650000;
const SOURCES = domain => [
  'https://www.google.com/s2/favicons?domain=' + encodeURIComponent(domain) + '&sz=128',
  'https://' + domain + '/apple-touch-icon.png',
  'https://icons.duckduckgo.com/ip3/' + domain + '.ico'
];

function imageMime(bytes) {
  if (bytes.length < 16 || bytes.length > MAX_BYTES) return '';
  if (bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47) return 'image/png';
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return 'image/jpeg';
  if (bytes[0] === 0 && bytes[1] === 0 && bytes[2] === 1 && bytes[3] === 0) return 'image/x-icon';
  if (bytes[0] === 0x47 && bytes[1] === 0x49 && bytes[2] === 0x46 && bytes[3] === 0x38) return 'image/gif';
  if (Buffer.from(bytes.subarray(0, 4)).toString('ascii') === 'RIFF' &&
      Buffer.from(bytes.subarray(8, 12)).toString('ascii') === 'WEBP') return 'image/webp';
  return '';
}

async function fetchLogo(domain, { fetchImpl = globalThis.fetch, timeoutMs = 3500 } = {}) {
  for (const url of SOURCES(domain)) {
    try {
      const response = await fetchImpl(url, {
        method: 'GET',
        headers: { accept: 'image/png,image/x-icon,image/jpeg,image/webp,image/*;q=0.8' },
        signal: AbortSignal.timeout(timeoutMs),
        redirect: 'follow'
      });
      if (!response?.ok) continue;
      const declaredSize = Number(response.headers?.get?.('content-length') || 0);
      if (declaredSize > MAX_BYTES) continue;
      const bytes = Buffer.from(await response.arrayBuffer());
      const mime = imageMime(bytes);
      if (mime) return { mime, bytes };
    } catch (_) { /* Network failure is not fatal; try next logo provider. */ }
  }
  return null;
}

async function handleWalletLogo(req, res, options = {}) {
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    res.setHeader('Allow', 'GET, HEAD');
    return res.status(405).end();
  }
  const raw = req.query?.brand;
  const id = typeof raw === 'string' ? raw.trim() : '';
  const domain = DOMAINS.get(id);
  if (!domain) return res.status(404).end();
  const result = await fetchLogo(domain, options);
  if (!result) {
    res.setHeader('Cache-Control', 'public, max-age=30, s-maxage=300');
    return res.status(404).end();
  }
  res.setHeader('Content-Type', result.mime);
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Cache-Control', 'public, max-age=86400, s-maxage=604800, stale-while-revalidate=86400');
  res.setHeader('Content-Length', result.bytes.length);
  return res.status(200).end(req.method === 'HEAD' ? undefined : result.bytes);
}
module.exports = { DOMAINS, imageMime, fetchLogo, handleWalletLogo };
