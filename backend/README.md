# Bloomie Backend

## Run

```bash
npm start
```

Server default:
- `http://127.0.0.1:4180`

The server:
- serves `bloomie-helpdesk-v1.html`
- serves API routes under `/api/*`
- persists state in `backend/data/bloomie.sqlite`
- supports tenant isolation, audit logs, SSO provider config, and Google Sheet ingestion
- writes logs to `backend/logs`
- writes snapshots to `backend/backups`
- runs periodic backup and Google Sheet sync workers

## Default Master Access
- ID: `master` or `SYS-000`
- Password: `Bloomie@9271#Master`

Override with:

```bash
BLOOMIE_MASTER_PASS='your-secret' npm start
```

## Key APIs
- `GET /api/health`
- `POST /api/auth/register`
- `POST /api/auth/login`
- `GET /api/bootstrap`
- `GET /api/master/tenants`
- `POST /api/master/tenants`
- `PATCH /api/master/tenants/:tenantCode`
- `GET /api/master/audit`
- `GET /api/security/sso`
- `PATCH /api/security/sso/:provider`
- `POST /api/security/policy`
- `GET /api/metrics`
- `GET /api/ops/status`
- `GET /api/master/backups`
- `POST /api/master/backups/create`
- `GET /api/master/backups/export`
- `POST /api/master/backups/restore`
- `POST /api/tickets`
- `GET /api/forum`
- `GET /api/reports/dashboard`
- `POST /api/sources/google-sheet/sync`
- `GET /api/sources/:sourceId/snapshot`
