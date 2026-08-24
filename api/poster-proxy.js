const ALLOWED_POSTER_HOST = /^(?:cdn\.mirage\.ru|s\d+ru1\.kinoplan24\.ru)$/iu;

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
    const response = await fetch(sourceUrl, {
      headers: {
        'user-agent': 'Mozilla/5.0 (compatible; RUDI-Poster-Proxy/1.0)',
        accept: 'image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8',
        referer: new URL(sourceUrl).hostname.endsWith('mirage.ru') ? 'https://www.mirage.ru/' : 'https://sky.kinopolis-film.ru/',
      },
      cache: 'no-store',
    });
    if (!response.ok) throw new Error(`poster-source-http-${response.status}`);
    const contentType = String(response.headers.get('content-type') || '').toLowerCase();
    if (!contentType.startsWith('image/')) throw new Error('poster-source-not-image');
    const buffer = Buffer.from(await response.arrayBuffer());
    if (!buffer.length || buffer.length > 10 * 1024 * 1024) throw new Error('poster-size-invalid');

    res.setHeader('content-type', contentType);
    res.setHeader('cache-control', 'public, max-age=86400, s-maxage=604800, stale-while-revalidate=86400');
    return res.status(200).send(buffer);
  } catch (error) {
    console.error('RUDI_POSTER_PROXY_ERROR', error);
    return res.status(400).json({ ok: false, error: String(error?.message || error) });
  }
}

module.exports = handler;
module.exports.validatePosterUrl = validatePosterUrl;
module.exports.ALLOWED_POSTER_HOST = ALLOWED_POSTER_HOST;
