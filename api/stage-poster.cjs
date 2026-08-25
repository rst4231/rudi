function decodeHtml(value) {
  return String(value || '')
    .replace(/&amp;/giu, '&')
    .replace(/&quot;/giu, '"')
    .replace(/&#39;|&apos;/giu, "'")
    .replace(/&lt;/giu, '<')
    .replace(/&gt;/giu, '>');
}

function safeHttpUrl(value, baseUrl) {
  try {
    const url = new URL(decodeHtml(value), baseUrl);
    return ['http:', 'https:'].includes(url.protocol) ? url.toString() : null;
  } catch {
    return null;
  }
}

function stageEventId(pageUrl) {
  try {
    const url = new URL(pageUrl);
    if (!/(?:^|\.)stagestandup\.ru$/iu.test(url.hostname)) return null;
    const match = url.hash.match(/ticketscloud:event=([^&]+)/iu);
    return match ? decodeURIComponent(match[1]) : null;
  } catch {
    return null;
  }
}

function imageCandidates(fragment, baseUrl) {
  const rows = [];
  const source = String(fragment || '');
  const attributePattern = /\b(?:data-original|data-src|src)\s*=\s*["']([^"']+)["']/giu;
  for (const match of source.matchAll(attributePattern)) {
    const url = safeHttpUrl(match[1], baseUrl);
    if (url) rows.push({ index: match.index, url });
  }
  const backgroundPattern = /background(?:-image)?\s*:\s*url\(\s*["']?([^"')]+)["']?\s*\)/giu;
  for (const match of source.matchAll(backgroundPattern)) {
    const url = safeHttpUrl(match[1], baseUrl);
    if (url) rows.push({ index: match.index, url });
  }
  return rows.sort((a, b) => a.index - b.index);
}

function extractStagePosterUrl(html, pageUrl) {
  const eventId = stageEventId(pageUrl);
  if (!eventId) return null;

  const source = String(html || '');
  const marker = `ticketscloud:event=${eventId}`;
  const eventIndex = source.indexOf(marker);
  if (eventIndex < 0) return null;

  const previousEventIndex = source.lastIndexOf('ticketscloud:event=', eventIndex - 1);
  const windowStart = previousEventIndex >= 0
    ? previousEventIndex + 'ticketscloud:event='.length
    : Math.max(0, eventIndex - 30000);
  const beforeEvent = source.slice(windowStart, eventIndex);
  const candidates = imageCandidates(beforeEvent, pageUrl);
  if (!candidates.length) return null;

  return candidates[candidates.length - 1].url;
}

function escapeHtmlAttribute(value) {
  return String(value || '')
    .replace(/&/gu, '&amp;')
    .replace(/"/gu, '&quot;')
    .replace(/</gu, '&lt;')
    .replace(/>/gu, '&gt;');
}

async function stageEventAwareFetch(input, init = {}, baseFetch = globalThis.fetch) {
  const rawUrl = typeof input === 'string' || input instanceof URL ? String(input) : String(input?.url || '');
  if (!stageEventId(rawUrl)) return baseFetch(input, init);

  const requestUrl = new URL(rawUrl);
  requestUrl.hash = '';
  const response = await baseFetch(requestUrl.toString(), init);
  if (!response?.ok) return response;

  const html = await response.text();
  const posterUrl = extractStagePosterUrl(html, rawUrl);
  const syntheticHtml = posterUrl
    ? `<html><head><meta property="og:image" content="${escapeHtmlAttribute(posterUrl)}"></head></html>`
    : '<html><head></head><body></body></html>';
  return new Response(syntheticHtml, {
    status: response.status,
    headers: { 'content-type': 'text/html; charset=utf-8' },
  });
}

function wrapStageEventFetch(baseFetch) {
  if (typeof baseFetch !== 'function') throw new TypeError('fetch is not available');
  return (input, init) => stageEventAwareFetch(input, init, baseFetch);
}

module.exports = {
  stageEventId,
  extractStagePosterUrl,
  stageEventAwareFetch,
  wrapStageEventFetch,
};
