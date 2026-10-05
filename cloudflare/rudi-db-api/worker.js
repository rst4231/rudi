function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
    },
  });
}

function authorized(request, env) {
  const secret = String(env.RUDI_API_SECRET || "");
  const auth = String(request.headers.get("authorization") || "");
  return secret && auth === `Bearer ${secret}`;
}

function clean(value, max = 200) {
  return String(value || "").trim().slice(0, max);
}

function encode(value) {
  return JSON.stringify(value ?? null);
}

function decode(value, fallback = null) {
  try {
    return JSON.parse(String(value));
  } catch {
    return fallback;
  }
}


const REALTIME_TOKEN_SKEW_MS = 30000;

function b64urlBytes(value) {
  const source = String(value || '').replace(/-/g, '+').replace(/_/g, '/');
  const padded = source + '='.repeat((4 - source.length % 4) % 4);
  const binary = atob(padded);
  return Uint8Array.from(binary, c => c.charCodeAt(0));
}

async function verifyRealtimeToken(token, secret) {
  const parts = String(token || '').split('.');
  if (parts.length !== 2 || !secret) return null;
  const [payload, signature] = parts;
  let data;
  try { data = JSON.parse(new TextDecoder().decode(b64urlBytes(payload))); } catch { return null; }
  const actor = clean(data?.actor, 40);
  const exp = Number(data?.exp || 0);
  if (!['Рустам','Диана'].includes(actor) || !Number.isFinite(exp) || exp < Date.now() - REALTIME_TOKEN_SKEW_MS) return null;
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(String(secret)),
    { name:'HMAC', hash:'SHA-256' },
    false,
    ['verify']
  );
  const ok = await crypto.subtle.verify('HMAC', key, b64urlBytes(signature), new TextEncoder().encode(payload));
  return ok ? { actor, exp } : null;
}

export class MessengerRoom {
  constructor(ctx, env) {
    this.ctx = ctx;
    this.env = env;
  }

  async fetch(request) {
    const url = new URL(request.url);
    if (url.pathname === '/connect') {
      if (request.headers.get('Upgrade') !== 'websocket') return new Response('Expected WebSocket',{status:400});
      const actor = clean(request.headers.get('x-rudi-actor'),40);
      if (!['Рустам','Диана'].includes(actor)) return new Response('Unauthorized',{status:401});
      const pair = new WebSocketPair();
      const [client, server] = Object.values(pair);
      server.serializeAttachment({actor});
      this.ctx.acceptWebSocket(server,['actor:'+actor]);
      server.send(JSON.stringify({type:'ready',at:new Date().toISOString()}));
      return new Response(null,{status:101,webSocket:client});
    }
    if (url.pathname === '/publish') {
      let body={};
      try{body=await request.json()}catch{}
      const payload=JSON.stringify({
        type:'sync',
        event:clean(body.event,80)||'sync',
        payload:body?.payload&&typeof body.payload==='object'?body.payload:null,
        at:body.at||new Date().toISOString()
      });
      let sent=0;
      for (const socket of this.ctx.getWebSockets()) {
        try { socket.send(payload); sent += 1; } catch {}
      }
      return json({ok:true,sent});
    }
    return new Response('Not found',{status:404});
  }

  webSocketMessage(ws,message) {
    if (String(message||'') === 'ping') {
      try{ws.send(JSON.stringify({type:'pong',at:new Date().toISOString()}))}catch{}
    }
  }

  webSocketClose(ws,code,reason) {
    try{ws.close(code,reason)}catch{}
  }

  webSocketError(ws) {
    try{ws.close(1011,'socket-error')}catch{}
  }
}


export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (request.method === "GET" && url.pathname === "/realtime") {
      const token = await verifyRealtimeToken(url.searchParams.get("token"), String(env.RUDI_API_SECRET || ""));
      if (!token) return json({ok:false,error:"unauthorized"},401);
      const id = env.MESSENGER_ROOM.idFromName("main");
      const stub = env.MESSENGER_ROOM.get(id);
      const headers = new Headers(request.headers);
      headers.set("x-rudi-actor",token.actor);
      return stub.fetch(new Request("https://rudi.internal/connect",{method:"GET",headers}));
    }

    if (request.method === "GET" && url.pathname === "/health") {
      try {
        await env.DB.prepare("SELECT 1 AS ok").first();
        return json({ ok: true, storage: "cloudflare-d1" });
      } catch (error) {
        return json(
          { ok: false, error: String(error?.message || error) },
          503
        );
      }
    }

    if (!authorized(request, env)) {
      return json({ ok: false, error: "unauthorized" }, 401);
    }

    if (request.method !== "POST") {
      return json({ ok: false, error: "method-not-allowed" }, 405);
    }

    if (url.pathname === "/realtime/publish") {
      const id = env.MESSENGER_ROOM.idFromName("main");
      const stub = env.MESSENGER_ROOM.get(id);
      return stub.fetch(new Request("https://rudi.internal/publish",{
        method:"POST",
        headers:{"content-type":"application/json"},
        body:await request.text(),
      }));
    }

    let body;
    try {
      body = await request.json();
    } catch {
      return json({ ok: false, error: "invalid-json" }, 400);
    }

    try {
      if (url.pathname === "/get") {
        const namespace = clean(body.namespace);
        const key = clean(body.key, 500);

        if (!namespace || !key) {
          return json({ ok: false, error: "missing-key" }, 400);
        }

        const row = await env.DB.prepare(`
          SELECT namespace, key, value, tags, expires_at, updated_at
          FROM rudi_state
          WHERE namespace = ?1 AND key = ?2
        `).bind(namespace, key).first();

        if (!row) {
          return json({ ok: true, value: null });
        }

        if (
          row.expires_at &&
          Number.isFinite(Date.parse(row.expires_at)) &&
          Date.parse(row.expires_at) <= Date.now()
        ) {
          await env.DB.prepare(`
            DELETE FROM rudi_state
            WHERE namespace = ?1 AND key = ?2
          `).bind(namespace, key).run();

          return json({ ok: true, value: null });
        }

        return json({
          ok: true,
          value: decode(row.value),
          tags: decode(row.tags, []),
          expiresAt: row.expires_at || null,
          updatedAt: row.updated_at || "",
        });
      }

      if (url.pathname === "/set") {
        const namespace = clean(body.namespace);
        const key = clean(body.key, 500);

        if (!namespace || !key) {
          return json({ ok: false, error: "missing-key" }, 400);
        }

        const updatedAt = new Date().toISOString();
        const tags = Array.isArray(body.tags)
          ? body.tags.map((x) => clean(x, 100)).filter(Boolean).slice(0, 50)
          : [];

        const expiresAt = body.expiresAt
          ? String(body.expiresAt)
          : null;

        await env.DB.prepare(`
          INSERT INTO rudi_state
            (namespace, key, value, tags, expires_at, updated_at)
          VALUES
            (?1, ?2, ?3, ?4, ?5, ?6)
          ON CONFLICT(namespace, key)
          DO UPDATE SET
            value = excluded.value,
            tags = excluded.tags,
            expires_at = excluded.expires_at,
            updated_at = excluded.updated_at
        `).bind(
          namespace,
          key,
          encode(body.value),
          encode(tags),
          expiresAt,
          updatedAt
        ).run();

        return json({ ok: true, updatedAt });
      }

      if (url.pathname === "/set-if-absent") {
        const namespace = clean(body.namespace);
        const key = clean(body.key, 500);

        if (!namespace || !key) {
          return json({ ok: false, error: "missing-key" }, 400);
        }

        await env.DB.prepare(`
          DELETE FROM rudi_state
          WHERE namespace = ?1
            AND key = ?2
            AND expires_at IS NOT NULL
            AND expires_at <= ?3
        `).bind(namespace, key, new Date().toISOString()).run();

        const updatedAt = new Date().toISOString();

        const result = await env.DB.prepare(`
          INSERT OR IGNORE INTO rudi_state
            (namespace, key, value, tags, expires_at, updated_at)
          VALUES
            (?1, ?2, ?3, ?4, ?5, ?6)
        `).bind(
          namespace,
          key,
          encode(body.value),
          encode(Array.isArray(body.tags) ? body.tags : []),
          body.expiresAt ? String(body.expiresAt) : null,
          updatedAt
        ).run();

        return json({
          ok: true,
          inserted: Number(result?.meta?.changes || 0) > 0,
        });
      }

      if (url.pathname === "/delete") {
        const namespace = clean(body.namespace);
        const key = clean(body.key, 500);

        if (!namespace || !key) {
          return json({ ok: false, error: "missing-key" }, 400);
        }

        await env.DB.prepare(`
          DELETE FROM rudi_state
          WHERE namespace = ?1 AND key = ?2
        `).bind(namespace, key).run();

        return json({ ok: true });
      }

      if (url.pathname === "/list") {
        const namespace = clean(body.namespace);

        if (!namespace) {
          return json({ ok: false, error: "missing-namespace" }, 400);
        }

        const result = await env.DB.prepare(`
          SELECT key, value, tags, expires_at, updated_at
          FROM rudi_state
          WHERE namespace = ?1
          ORDER BY key
          LIMIT 1000
        `).bind(namespace).all();

        const now = Date.now();

        const items = (result.results || [])
          .filter((row) => {
            if (!row.expires_at) return true;
            const expires = Date.parse(row.expires_at);
            return !Number.isFinite(expires) || expires > now;
          })
          .map((row) => ({
            key: row.key,
            value: decode(row.value),
            tags: decode(row.tags, []),
            expiresAt: row.expires_at || null,
            updatedAt: row.updated_at || "",
          }));

        return json({ ok: true, items });
      }

      if (url.pathname === "/expire-tag") {
        const namespace = clean(body.namespace);
        const tag = clean(body.tag, 100);

        if (!namespace || !tag) {
          return json({ ok: false, error: "missing-tag" }, 400);
        }

        const rows = await env.DB.prepare(`
          SELECT key, tags
          FROM rudi_state
          WHERE namespace = ?1
        `).bind(namespace).all();

        const keys = (rows.results || [])
          .filter((row) => decode(row.tags, []).includes(tag))
          .map((row) => row.key);

        for (const key of keys) {
          await env.DB.prepare(`
            DELETE FROM rudi_state
            WHERE namespace = ?1 AND key = ?2
          `).bind(namespace, key).run();
        }

        return json({ ok: true, deleted: keys.length });
      }

      return json({ ok: false, error: "not-found" }, 404);
    } catch (error) {
      console.error("RUDI_D1_ERROR", error);
      return json(
        { ok: false, error: String(error?.message || error) },
        500
      );
    }
  },
};