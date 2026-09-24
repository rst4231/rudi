const http = require('node:http');

const UPSTREAM_ORIGIN = 'https://spb-daily-guide-bot.vercel.app';
const PORT = Number(process.env.PORT || 10000);
const MAX_BODY_BYTES = 25 * 1024 * 1024;
const HOP_BY_HOP = new Set([
  'connection','keep-alive','proxy-authenticate','proxy-authorization',
  'te','trailer','transfer-encoding','upgrade','host','content-length','accept-encoding'
]);

function publicOrigin(req) {
  const proto = String(req.headers['x-forwarded-proto'] || 'https').split(',')[0].trim() || 'https';
  const host = String(req.headers['x-forwarded-host'] || req.headers.host || '').split(',')[0].trim();
  return host ? proto + '://' + host : '';
}

function upstreamHeaders(req) {
  const headers = new Headers();
  for (const [name, rawValue] of Object.entries(req.headers)) {
    const lower = name.toLowerCase();
    if (HOP_BY_HOP.has(lower) || rawValue == null) continue;
    headers.set(name, Array.isArray(rawValue) ? rawValue.join(', ') : String(rawValue));
  }
  headers.set('x-rudi-proxy', 'render');
  return headers;
}

async function readBody(req) {
  if (req.method === 'GET' || req.method === 'HEAD') return undefined;
  const chunks = [];
  let total = 0;
  for await (const chunk of req) {
    total += chunk.length;
    if (total > MAX_BODY_BYTES) {
      const error = new Error('request-too-large');
      error.statusCode = 413;
      throw error;
    }
    chunks.push(chunk);
  }
  return chunks.length ? Buffer.concat(chunks) : undefined;
}

function rewriteLocation(value, req) {
  const origin = publicOrigin(req);
  if (!origin || !value) return value;
  return String(value).replaceAll(UPSTREAM_ORIGIN, origin);
}

function rewriteCookie(value) {
  return String(value || '').replace(/;\s*Domain=\.?(?:spb-daily-guide-bot\.vercel\.app|vercel\.app)/ig, '');
}

async function handler(req, res) {
  if (req.url === '/__proxy_health') {
    res.writeHead(200, {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'no-store',
      'x-rudi-proxy': 'render',
    });
    res.end(JSON.stringify({ ok: true, proxy: 'render' }));
    return;
  }

  const target = new URL(req.url || '/', UPSTREAM_ORIGIN);
  const body = await readBody(req);
  const upstream = await fetch(target, {
    method: req.method,
    headers: upstreamHeaders(req),
    body,
    redirect: 'manual',
  });

  for (const [name, value] of upstream.headers) {
    const lower = name.toLowerCase();
    if (HOP_BY_HOP.has(lower) || lower === 'set-cookie' || lower === 'location') continue;
    res.setHeader(name, value);
  }

  const location = upstream.headers.get('location');
  if (location) res.setHeader('location', rewriteLocation(location, req));

  if (typeof upstream.headers.getSetCookie === 'function') {
    const cookies = upstream.headers.getSetCookie().map(rewriteCookie).filter(Boolean);
    if (cookies.length) res.setHeader('set-cookie', cookies);
  } else {
    const cookie = upstream.headers.get('set-cookie');
    if (cookie) res.setHeader('set-cookie', rewriteCookie(cookie));
  }

  res.setHeader('x-rudi-proxy', 'render');
  res.statusCode = upstream.status;
  res.statusMessage = upstream.statusText || res.statusMessage;

  if (req.method === 'HEAD' || !upstream.body) {
    res.end();
    return;
  }

  const reader = upstream.body.getReader();
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      if (!res.write(Buffer.from(value))) await new Promise(resolve => res.once('drain', resolve));
    }
    res.end();
  } finally {
    reader.releaseLock();
  }
}

const server = http.createServer((req, res) => {
  handler(req, res).catch(error => {
    const status = Number(error?.statusCode) || 502;
    if (!res.headersSent) {
      res.writeHead(status, {
        'content-type': 'application/json; charset=utf-8',
        'cache-control': 'no-store',
        'x-rudi-proxy': 'render',
      });
    }
    res.end(JSON.stringify({ ok: false, error: status === 413 ? 'request-too-large' : 'proxy-upstream-unavailable' }));
  });
});

server.keepAliveTimeout = 65_000;
server.headersTimeout = 70_000;
server.listen(PORT, '0.0.0.0', () => {
  console.log('RUDI Render proxy listening on', PORT);
});
