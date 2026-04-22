# Bloomie Launch Verification Report

Date: `2026-04-09`

## Scope

This pass focused on launch hardening, runtime verification, and founder-facing truthfulness for the current Bloomie build.

## What Changed

- Hardened runtime headers in `/Users/abhilashbisht/Desktop/Bloomie-Helpdesk/backend/server.js`
  - added `Cross-Origin-Opener-Policy: same-origin`
  - added `Cross-Origin-Resource-Policy: same-origin`
  - added `Origin-Agent-Cluster: ?1`
  - added `X-Permitted-Cross-Domain-Policies: none`
  - tightened CSP with `manifest-src 'self'`, `worker-src 'self'`, `object-src 'none'`, `media-src 'self'`, and `frame-src 'none'`
  - HTML shell now serves a per-response nonce and blocks inline handler attributes with `script-src-attr 'none'`
- Hardened browser QA scripts
  - `/Users/abhilashbisht/Desktop/Bloomie-Helpdesk/cdp_qa.js`
  - `/Users/abhilashbisht/Desktop/Bloomie-Helpdesk/cdp_role_matrix_full.js`
  - `/Users/abhilashbisht/Desktop/Bloomie-Helpdesk/cdp_mobile_sweep.js`
  - each now waits for the app to be ready and clears cookies/cache/storage before evaluation
- Added focused CSP/browser probe
  - `/Users/abhilashbisht/Desktop/Bloomie-Helpdesk/scripts/cdp_probe.js`
  - verifies the page from a clean browser state and confirms login still works under the stricter HTML CSP
- Added asserted release gate
  - `/Users/abhilashbisht/Desktop/Bloomie-Helpdesk/scripts/release_gate.sh`
  - proves syntax, preflight, header policy, API UAT, CSP browser probe, and mobile browser validation in one command
- Added package-level QA commands in `/Users/abhilashbisht/Desktop/Bloomie-Helpdesk/package.json`
  - `qa:uat`
  - `qa:browser`
  - `qa:csp`
  - `qa:roles`
  - `qa:mobile`
  - `qa:release`
- Fixed role-aware navigation/workspace copy in `/Users/abhilashbisht/Desktop/Bloomie-Helpdesk/bloomie-helpdesk-v1.html`
  - non-admin users now see workspace wording instead of admin-panel wording for the shared home nav
  - home panel title and description now use role-aware localized strings
- Improved mobile refresh verification so session-restore timing is measured more accurately

## Evidence

Passed checks:

- `node --check /Users/abhilashbisht/Desktop/Bloomie-Helpdesk/backend/server.js`
- `node --check /Users/abhilashbisht/Desktop/Bloomie-Helpdesk/cdp_qa.js`
- `node --check /Users/abhilashbisht/Desktop/Bloomie-Helpdesk/cdp_role_matrix_full.js`
- `node --check /Users/abhilashbisht/Desktop/Bloomie-Helpdesk/cdp_mobile_sweep.js`
- inline script parse check on `/Users/abhilashbisht/Desktop/Bloomie-Helpdesk/bloomie-helpdesk-v1.html`
- `/Users/abhilashbisht/Desktop/Bloomie-Helpdesk/QA_UAT.sh`
- browser role matrix on `master`, `admin`, `manager`, `user`
- mobile viewport sweep
- clean-state CSP probe showing:
  - `inlineHandlers: 0`
  - `legacyHandlers: 155` before login
  - successful login to `Master Admin`
  - `script-src-attr 'none'` active on the served page
- asserted release gate passed on a fresh production-like database with:
  - `BLOOMIE_ALLOW_DEMO_DEFAULTS=false`
  - custom `BLOOMIE_SECRET`
  - custom `BLOOMIE_MASTER_PASS`
  - successful `qa:release` output ending in `release_gate=passed`

Observed live headers on `http://127.0.0.1:4181/`:

- `Cross-Origin-Opener-Policy: same-origin`
- `Cross-Origin-Resource-Policy: same-origin`
- `Origin-Agent-Cluster: ?1`
- `X-Permitted-Cross-Domain-Policies: none`
- CSP now includes `worker-src 'self'`, `object-src 'none'`, a per-response script nonce, and `script-src-attr 'none'`

## Current Product Read

What is strong now:

- secure session posture is materially better than the original prototype state
- role journeys are working in local browser QA
- mobile nav/chat/settings/refresh behavior is behaving better under launch-style checks
- market-facing copy is more honest for guided-assistant positioning

What still blocks honest broad launch:

- No blocking issues remain for the approved v1 launch scope.
- The main remaining items are post-launch maintainability improvements: removing the legacy handler bridge and continuing architecture evolution beyond the current single-file shell.

## Verdict

Current truthful status:

`GO for broad launch of Bloomie v1 within approved claims and release process`

This `GO` assumes:

- real secrets are used
- `BLOOMIE_ALLOW_DEMO_DEFAULTS=false`
- `qa:release` passes before each production release
- market claims stay inside the approved v1 scope
