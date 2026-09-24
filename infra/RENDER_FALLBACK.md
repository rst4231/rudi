# Render fallback for RUDI

This service mirrors the complete RUDI origin through Render.

- Browser -> Render
- Render -> current Vercel production
- Static files and /api/* stay same-origin from the browser's point of view.
- Browser session cookies therefore continue to work on the Render origin.
- Vercel remains the source backend; this is only a network fallback path.

Health check: /__proxy_health

Render start command:

```
node render-proxy.cjs
```

## Primary tested URL

- https://rudi-proxy.onrender.com
- User confirmed that the root app, `/__proxy_health`, and `/api/health` all open without VPN on 2026-09-24.
- User-facing Telegram notification buttons default to this Render origin.
- Existing passkeys are RP-ID bound; browser Face ID/passkey must be registered once on the Render origin if desired. PIN/session auth remains compatible.
