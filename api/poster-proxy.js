const ALLOWED_POSTER_HOST = /^(?:cdn\.mirage\.ru|s\d+ru1\.kinoplan24\.ru)$/iu;
const POSTER_TIMEOUT_MS = 4500;

function validatePosterUrl(raw) {
  let url;
  try { url = new URL(String(raw || '')); } catch { throw new Error('invalid-poster-url'); }
  if (url.protocol !== 'https:' || !ALLOWED_POSTER_HOST.test(url.hostname)) throw new Error('poster-host-not-allowed');
  return url.toString();
}

async function handler(req, res) {
  if (String(req?.method || 'GET').toUpperCase() !== 'GET') {
    return res.status(405).json({ ok: false, error: 'method-not-allowed' });
  }

  try {
    const sourceUrl = validatePosterUrl(req?.query?.url);
    let response = null;
    let lastError = null;
    for (let attempt = 0; attempt < 2; attempt += 1) {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), POSTER_TIMEOUT_MS);
      try {
        response = await fetch(sourceUrl, {
          headers: {
            'user-agent': 'Mozilla/5.0 (compatible; RUDI-Poster-Proxy/1.0)',
            accept: 'image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8',
            referer: new URL(sourceUrl).hostname.endsWith('mirage.ru') ? 'https://www.mirage.ru/' : 'https://sky.kinopolis-film.ru/',
          },
          signal: controller.signal,
          cache: 'no-store',
        });
        if (response.ok) break;
        const error = Object.assign(new Error(`poster-source-http-${response.status}`), { status: response.status });
        if (response.status < 500 || attempt === 1) throw error;
        lastError = error;
      } catch (error) {
        const normalized = error?.name === 'AbortError'
          ? Object.assign(new Error('poster-source-timeout'), { code: 'POSTER_TIMEOUT' })
          : error;
        lastError = normalized;
        const retryable = attempt === 0 && (normalized?.code === 'POSTER_TIMEOUT' || normalized?.name === 'TypeError' || Number(normalized?.status || 0) >= 500);
        if (!retryable) throw normalized;
      } finally {
        clearTimeout(timer);
      }
    }
    if (!response?.ok) throw lastError || new Error('poster-source-unavailable');
    const contentType = String(response.headers.get('content-type') || '').toLowerCase();
    if (!contentType.startsWith('image/')) throw new Error('poster-source-not-image');
    const buffer = Buffer.from(await response.arrayBuffer());
    if (!buffer.length || buffer.length > 10 * 1024 * 1024) throw new Error('poster-size-invalid');

    res.setHeader('content-type', contentType);
    res.setHeader('cache-control', 'public, max-age=86400, s-maxage=604800, stale-while-revalidate=86400');
    return res.status(200).send(buffer);
  } catch (error) {
    console.error('RUDI_POSTER_PROXY_ERROR', error);
    const message = String(error?.message || error);
    const status = /^(?:invalid-poster-url|poster-host-not-allowed)$/u.test(message)
      ? 400
      : (message === 'poster-source-timeout' ? 504 : 502);
    return res.status(status).json({ ok: false, error: message });
  }
}

module.exports = handler;
module.exports.validatePosterUrl = validatePosterUrl;
module.exports.ALLOWED_POSTER_HOST = ALLOWED_POSTER_HOST;
module.exports.POSTER_TIMEOUT_MS = POSTER_TIMEOUT_MS;
