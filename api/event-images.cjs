const { EVENTS_TOPIC_ID, telegramEndpoint, parseRequestPayload } = require('./topic-maintenance-base.cjs');

const MAX_PAGE_BYTES = 2 * 1024 * 1024;

function decodeHtml(value) {
  return String(value || '')
    .replace(/&amp;/giu, '&')
    .replace(/&quot;/giu, '"')
    .replace(/&#39;|&apos;/giu, "'")
    .replace(/&lt;/giu, '<')
    .replace(/&gt;/giu, '>');
}

function safePublicHttpUrl(raw, base) {
  let url;
  try { url = new URL(decodeHtml(raw), base); } catch { return null; }
  if (!['http:', 'https:'].includes(url.protocol)) return null;
  const host = url.hostname.toLowerCase().replace(/^\[|\]$/g, '');
  if (!host || host === 'localhost' || host.endsWith('.local')) return null;
  if (/^(?:127\.|10\.|169\.254\.|192\.168\.|0\.)/u.test(host)) return null;
  const private172 = host.match(/^172\.(\d+)\./u);
  if (private172 && Number(private172[1]) >= 16 && Number(private172[1]) <= 31) return null;
  if (host === '::1' || host.startsWith('fc') || host.startsWith('fd') || host.startsWith('fe80:')) return null;
  return url.toString();
}

function isEventDigestText(text) {
  const value = String(text || '');
  return /🎤\s*Поп и хип-хоп концерты|🎙\s*Stage StandUp Club/iu.test(value);
}

function extractEventSourceLinks(text) {
  const source = String(text || '');
  const links = [];
  const seen = new Set();
  const re = /<a\b[^>]*href=["']([^"']+)["'][^>]*>/giu;
  let match;
  while ((match = re.exec(source))) {
    const url = safePublicHttpUrl(match[1]);
    if (!url || seen.has(url)) continue;
    seen.add(url);
    links.push(url);
    if (links.length >= 10) break;
  }
  return links;
}

function extractMetaImage(html, pageUrl) {
  const source = String(html || '');
  const patterns = [
    /<meta\b[^>]*(?:property|name)=["']og:image(?::secure_url)?["'][^>]*content=["']([^"']+)["'][^>]*>/iu,
    /<meta\b[^>]*content=["']([^"']+)["'][^>]*(?:property|name)=["']og:image(?::secure_url)?["'][^>]*>/iu,
    /<meta\b[^>]*(?:property|name)=["']twitter:image(?::src)?["'][^>]*content=["']([^"']+)["'][^>]*>/iu,
    /<meta\b[^>]*content=["']([^"']+)["'][^>]*(?:property|name)=["']twitter:image(?::src)?["'][^>]*>/iu,
    /["']image["']\s*:\s*["']([^"']+)["']/iu,
  ];
  for (const pattern of patterns) {
    const match = source.match(pattern);
    if (!match?.[1]) continue;
    const url = safePublicHttpUrl(match[1], pageUrl);
    if (url) return url;
  }
  return null;
}

async function loadEventImage(pageUrl, options = {}) {
  const url = safePublicHttpUrl(pageUrl);
  if (!url) return null;
  const fetchImpl = options.fetchImpl || globalThis.fetch;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), Number(options.timeoutMs || 5500));
  try {
    const response = await fetchImpl(url, {
      headers: {
        'user-agent': 'Mozilla/5.0 (compatible; RUDI-Event-Images/1.0)',
        accept: 'text/html,application/xhtml+xml;q=0.9,*/*;q=0.5',
        'accept-language': 'ru-RU,ru;q=0.9,en;q=0.6',
      },
      redirect: 'follow',
      cache: 'no-store',
      signal: controller.signal,
    });
    if (!response?.ok) return null;
    const contentLength = Number(response.headers?.get?.('content-length') || 0);
    if (contentLength > MAX_PAGE_BYTES) return null;
    const html = await response.text();
    if (Buffer.byteLength(html, 'utf8') > MAX_PAGE_BYTES) return null;
    return extractMetaImage(html, response.url || url);
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

async function collectEventImages(text, options = {}) {
  const links = extractEventSourceLinks(text);
  if (!links.length) return [];
  const maxImages = Math.max(1, Math.min(6, Number(options.maxImages || 4)));
  const settled = await Promise.allSettled(links.slice(0, 8).map(async (pageUrl) => ({
    pageUrl,
    imageUrl: await loadEventImage(pageUrl, options),
  })));
  const seen = new Set();
  const rows = [];
  for (const result of settled) {
    const row = result.status === 'fulfilled' ? result.value : null;
    if (!row?.imageUrl || seen.has(row.imageUrl)) continue;
    seen.add(row.imageUrl);
    rows.push(row);
    if (rows.length >= maxImages) break;
  }
  return rows;
}

async function sendTelegramImage(endpoint, payload, options = {}) {
  const sendTelegram = options.sendTelegram;
  if (typeof sendTelegram !== 'function') throw new Error('event-image-sender-missing');
  return sendTelegram(`${endpoint.baseUrl}/${payload.method}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(payload.body),
  });
}

async function maybeSendEventImages(input, init = {}, options = {}) {
  const endpoint = telegramEndpoint(input);
  const payload = parseRequestPayload(init);
  if (!endpoint || endpoint.method !== 'sendMessage') return { sent: 0, skipped: 'not-message' };
  if (Number(payload?.message_thread_id) !== EVENTS_TOPIC_ID) return { sent: 0, skipped: 'not-events-topic' };
  if (!isEventDigestText(payload?.text)) return { sent: 0, skipped: 'not-image-event-digest' };

  const images = await collectEventImages(payload.text, options);
  if (!images.length) return { sent: 0, skipped: 'no-images' };

  const baseBody = {
    chat_id: payload.chat_id,
    message_thread_id: payload.message_thread_id,
    disable_notification: true,
  };

  if (images.length === 1) {
    const response = await sendTelegramImage(endpoint, {
      method: 'sendPhoto',
      body: { ...baseBody, photo: images[0].imageUrl },
    }, options);
    return { sent: response?.ok ? 1 : 0, mode: 'photo' };
  }

  const album = images.map((row) => ({ type: 'photo', media: row.imageUrl }));
  const groupResponse = await sendTelegramImage(endpoint, {
    method: 'sendMediaGroup',
    body: { ...baseBody, media: album },
  }, options);
  if (groupResponse?.ok) return { sent: images.length, mode: 'album' };

  let sent = 0;
  for (const row of images) {
    try {
      const response = await sendTelegramImage(endpoint, {
        method: 'sendPhoto',
        body: { ...baseBody, photo: row.imageUrl },
      }, options);
      if (response?.ok) sent += 1;
    } catch {}
  }
  return { sent, mode: 'fallback-photos' };
}

module.exports = {
  decodeHtml,
  safePublicHttpUrl,
  isEventDigestText,
  extractEventSourceLinks,
  extractMetaImage,
  loadEventImage,
  collectEventImages,
  maybeSendEventImages,
};
