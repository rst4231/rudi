const UPSTREAM_ORIGIN = 'https://spb-daily-guide-bot.vercel.app';
const MAX_BODY_BYTES = 25 * 1024 * 1024;
const HOP_BY_HOP = new Set([
  'connection','keep-alive','proxy-authenticate','proxy-authorization',
  'te','trailer','transfer-encoding','upgrade','host','content-length','accept-encoding'
]);

function isVersionedStaticRequest(url) {
  return url.searchParams.has('v')
    && /\.(?:css|js|png|jpe?g|svg|webp|ico|webmanifest)$/i.test(url.pathname);
}

function rewriteCookie(value) {
  return String(value || '').replace(
    /;\s*Domain=\.?(?:spb-daily-guide-bot\.vercel\.app|vercel\.app)/ig,
    ''
  );
}

function responseHeadersFrom(upstream, publicOrigin, incomingUrl) {
  const headers = new Headers();

  for (const [name, value] of upstream.headers) {
    const lower = name.toLowerCase();
    if (
      HOP_BY_HOP.has(lower) ||
      lower === 'set-cookie' ||
      lower === 'location' ||
      lower === 'content-encoding'
    ) continue;
    headers.append(name, value);
  }

  const location = upstream.headers.get('location');
  if (location) {
    headers.set('location', String(location).replaceAll(UPSTREAM_ORIGIN, publicOrigin));
  }

  if (typeof upstream.headers.getSetCookie === 'function') {
    for (const cookie of upstream.headers.getSetCookie()) {
      const rewritten = rewriteCookie(cookie);
      if (rewritten) headers.append('set-cookie', rewritten);
    }
  } else {
    const cookie = upstream.headers.get('set-cookie');
    if (cookie) headers.append('set-cookie', rewriteCookie(cookie));
  }

  if (isVersionedStaticRequest(incomingUrl)) {
    headers.set(
      'cache-control',
      upstream.ok ? 'public, max-age=31536000, immutable' : 'no-store'
    );
  }
  headers.set('x-rudi-proxy', 'deno');
  return headers;
}

async function handler(request) {
  const incomingUrl = new URL(request.url);

  if (incomingUrl.pathname === '/__proxy_health') {
    return Response.json(
      {
        ok: true,
        proxy: 'deno',
        upstream: UPSTREAM_ORIGIN,
      },
      {
        headers: {
          'cache-control': 'no-store',
          'x-rudi-proxy': 'deno',
        },
      },
    );
  }

  try {
    const contentLength = Number(request.headers.get('content-length') || 0);
    if (Number.isFinite(contentLength) && contentLength > MAX_BODY_BYTES) {
      return Response.json(
        { ok: false, error: 'request-too-large' },
        {
          status: 413,
          headers: {
            'cache-control': 'no-store',
            'x-rudi-proxy': 'deno',
          },
        },
      );
    }

    const target = new URL(incomingUrl.pathname + incomingUrl.search, UPSTREAM_ORIGIN);
    const headers = new Headers();

    for (const [name, value] of request.headers) {
      if (!HOP_BY_HOP.has(name.toLowerCase())) headers.set(name, value);
    }

    headers.set('x-rudi-proxy', 'deno');
    headers.set('x-rudi-public-origin', incomingUrl.origin);

    const upstream = await fetch(target, {
      method: request.method,
      headers,
      body: request.method === 'GET' || request.method === 'HEAD' ? undefined : request.body,
      redirect: 'manual',
    });

    return new Response(
      request.method === 'HEAD' ? null : upstream.body,
      {
        status: upstream.status,
        statusText: upstream.statusText,
        headers: responseHeadersFrom(upstream, incomingUrl.origin, incomingUrl),
      },
    );
  } catch (error) {
    console.error('RUDI_DENO_PROXY_ERROR', error);
    return Response.json(
      { ok: false, error: 'proxy-upstream-unavailable' },
      {
        status: 502,
        headers: {
          'cache-control': 'no-store',
          'x-rudi-proxy': 'deno',
        },
      },
    );
  }
}

Deno.serve(
  {
    onListen({ hostname, port }) {
      console.log('RUDI Deno proxy listening on', hostname + ':' + port);
    },
  },
  handler,
);
