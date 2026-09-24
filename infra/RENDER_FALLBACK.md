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
