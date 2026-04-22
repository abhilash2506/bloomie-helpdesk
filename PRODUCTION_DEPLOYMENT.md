# Bloomie Production Deployment

## Runtime
- Node 22+
- Reverse proxy: Nginx or Caddy
- Public HTTPS domain
- Persistent storage for `backend/data`, `backend/backups`, and `backend/logs`

## Environment
Copy [.env.example](/Users/abhilashbisht/Desktop/Bloomie-Helpdesk/.env.example) to `.env` and set:
- `BLOOMIE_BASE_URL`
- `BLOOMIE_ALLOW_DEMO_DEFAULTS=false`
- `BLOOMIE_SECRET`
- `BLOOMIE_MASTER_PASS`

## Start
```bash
BLOOMIE_PORT=4181 npm run dev
```

## Included Production Controls
- signed sessions
- auth and write rate limiting
- tenant isolation
- audit logs
- backup creation and restore APIs
- periodic backup snapshots
- periodic Google Sheet sync worker
- metrics and ops status endpoints
- SSO provider configuration model for Google and Microsoft
- reverse-proxy config example in [deploy/nginx/bloomie.conf](/Users/abhilashbisht/Desktop/Bloomie-Helpdesk/deploy/nginx/bloomie.conf)
- systemd service example in [deploy/systemd/bloomie.service](/Users/abhilashbisht/Desktop/Bloomie-Helpdesk/deploy/systemd/bloomie.service)

## Ops Endpoints
- `GET /api/health`
- `GET /api/metrics`
- `GET /api/ops/status`
- `GET /api/master/audit`
- `GET /api/master/backups`
- `POST /api/master/backups/create`
- `GET /api/master/backups/export`
- `POST /api/master/backups/restore`

## SSO
Configure per tenant using:
- `PATCH /api/security/sso/google`
- `PATCH /api/security/sso/microsoft`

Required fields:
- `enabled`
- `clientId`
- `clientSecret`
- `redirectUri`
- `issuerUrl`
- `scopes`

Login routes:
- `/api/auth/google/start?tenant=TENANTCODE`
- `/api/auth/microsoft/start?tenant=TENANTCODE`

Callback routes:
- `/api/auth/google/callback`
- `/api/auth/microsoft/callback`

## Final Recommendation
Before public go-live:
1. set real TLS domain and reverse proxy
2. keep `BLOOMIE_ALLOW_DEMO_DEFAULTS=false` in production
3. configure SSO client secrets in production
4. test backup restore on a staging copy
5. point Google Sheet sync to real shared sources
6. review allowed email domains and registration policy per tenant
