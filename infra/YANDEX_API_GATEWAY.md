# RUDI Yandex API Gateway proxy

This gateway is a network fallback for RUDI when Vercel Functions are not reachable
reliably from the user's ISP while static Vercel assets still work.

## What it does

- Accepts `/api/*` on Yandex API Gateway.
- Proxies the request to `https://spb-daily-guide-bot.vercel.app/api/*`.
- Preserves request headers, cookies, query parameters, HTTP method and body.
- Allows credentialed browser requests from the production RUDI origin only.
- Does not replace the Vercel backend or its storage.

## Create the gateway

1. Open Yandex Cloud Console.
2. Select the target cloud/folder.
3. Open **API Gateway** -> **Create API gateway**.
4. Name it `rudi-api-proxy`.
5. Paste the contents of `infra/yandex-api-gateway.yaml` into the specification field.
6. Create the gateway.
7. Copy the public gateway domain.

Test:

```
https://<gateway-domain>/api/health
```

The response should match the existing RUDI health JSON.

Do not change RUDI frontend yet. First verify that the gateway URL opens without VPN.
