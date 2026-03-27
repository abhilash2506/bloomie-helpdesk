# Bloomie Demo Deployment

## Best next step
Deploy Bloomie to a public Docker-compatible host first, then attach a custom domain later.

This repo is now prepared for that flow.

## What changed for hosting
- server now binds to `0.0.0.0` by default
- server honors platform `PORT`
- Docker healthcheck added
- `.dockerignore` excludes local data/logs/backups
- `render.yaml` added for a public web deployment with persistent disks

## Recommended demo path
1. Push this repo to GitHub.
2. Create a new Render service from the repo.
3. Let Render detect `render.yaml`.
4. Set these required env vars:
   - `BLOOMIE_BASE_URL`
   - `BLOOMIE_MASTER_PASS`
5. Deploy.
6. Open `https://your-public-url/api/health` and confirm `{ "ok": true }`.
7. Open the app URL and log in with:
   - Company Code: `DEFAULT`
   - ID: `master`
   - Password: your `BLOOMIE_MASTER_PASS`

## Important notes
- Public sharing must use the deployed URL, not `127.0.0.1`.
- Google SSO will only work after adding a real OAuth client and updating the callback URL to:
  - `https://your-public-url/api/auth/google/callback`
- Persistent storage is required for:
  - `backend/data`
  - `backend/logs`
  - `backend/backups`

## After demo feedback
1. Buy the domain.
2. Set `BLOOMIE_BASE_URL` to the final HTTPS domain.
3. Update Google/Microsoft callback URLs.
4. Re-run the demo smoke tests.
