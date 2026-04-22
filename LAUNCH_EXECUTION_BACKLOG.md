# Bloomie Launch Execution Backlog

## Program Status

- Project charter: complete
- Agent workflow: complete
- Hardening sprint: tranche 3 complete
- Founder launch bar: active
- Launch verification: refreshed on 2026-04-09

## Launch Gate

Current gate: `GO for broad launch of Bloomie v1 within approved product claims`

Reason:

- HR/privacy-sensitive product
- production-like release gate now passes on a clean build with demo defaults disabled
- frontend HTML shell now runs under nonce-based CSP with `script-src-attr 'none'`
- repeatable launch evidence now exists as `qa:release`
- market claims must still stay inside the approved v1 positioning

## Workstreams

### 1. Backend Hardening

Owner: Backend Coding Agent

Tasks:

- add tenant-level control for self-registration
- default self-registration to secure behavior for launch
- ensure registration flow is commercially defensible
- review session and auth hardening opportunities
- document backend launch assumptions

Status: materially improved

Definition of done:

- open registration no longer undermines customer trust
- backend launch defaults are safer
- demo defaults require explicit opt-in

### 2. Frontend Hardening

Owner: Frontend Coding Agent

Tasks:

- stop caching authenticated API responses in service worker
- reduce unsafe stale-data behavior in PWA mode
- align AI language with actual current behavior
- preserve usability after security hardening

Status: materially improved

Definition of done:

- no obvious frontend privacy leak remains
- browser auth persistence risk is reduced
- UI claims are honest and sale-safe

### 3. Testing and Launch Gates

Owner: Testing Agent

Tasks:

- define security smoke suite
- define role and tenant regression suite
- define PWA, desktop, and mobile launch checks
- define founder signoff checklist

Status: initial automated UAT passing
Status detail:

- `QA_UAT.sh` passing on hardened build
- browser role matrix passing for `master`, `admin`, `manager`, and `user`
- mobile viewport sweep passing for login, nav, chat, settings, and refresh restore
- browser launch smoke scripts hardened to clear cookies/cache per run

Definition of done:

- exact pass/fail launch checks exist
- remaining risk is explicit

### 4. UX and Trust Review

Owner: UI/UX Agent

Tasks:

- review login, registration, onboarding, admin, and master journeys
- identify trust gaps in AI, security, and setup flows
- suggest functional improvements that support selling

Status: materially improved

Definition of done:

- major workflow friction is either fixed or explicitly queued

### 5. Marketing and Positioning

Owner: Marketing Agent

Tasks:

- define best ICP for current product state
- define safe market claims
- flag overpromising claims
- produce launch message direction

Status: materially improved

Definition of done:

- market-facing story matches product reality

### 6. Sales and Sellability

Owner: Sales Agent

Tasks:

- define current sellability
- define safest deal structure
- define key procurement objections
- define launch readiness criteria from buyer perspective

Status: founder-led motion defined

Definition of done:

- founder has a practical pilot sales motion

### 7. Final Audit

Owner: Final Auditor

Tasks:

- review all critical blocker status
- decide GO or NO-GO
- list must-fix items if NO-GO

Status: complete for current launch candidate

Definition of done:

- final launch verdict is explicit

### 8. Product Management Synthesis

Owner: Product Manager

Tasks:

- convert specialist findings into dependency-ordered execution
- reassign unresolved work
- maintain launch bar until all critical stakeholders return GO

Status: pending downstream reports

Definition of done:

- backlog remains actionable and current

## Immediate Critical Tasks

Priority order:

1. Keep `qa:release` as the mandatory pre-launch and pre-release gate.
2. Retire the remaining legacy handler bridge over time and move fully to native event binding.
3. Maintain approved product claims and avoid overpromising enterprise compliance or source-grounded AI beyond current capability.
4. Complete founder launch package: deployment checklist, rollback steps, and exact market claims.

## Founder Reporting Format

Every cycle should answer:

- what changed
- what still blocks launch
- what can be sold safely today
- what would still create founder risk
- current GO or NO-GO

## Exit Criteria

This backlog is complete only when:

- all critical tasks are closed
- auditor says `GO`
- marketing and sales say the product can be sold honestly
- founder can launch without carrying hidden risk

## Latest Evidence Snapshot

Verified on `2026-04-09`:

- `node --check backend/server.js`
- `node --check cdp_qa.js`
- `node --check cdp_role_matrix_full.js`
- `node --check cdp_mobile_sweep.js`
- frontend inline script parse check: passed
- `./QA_UAT.sh`: passed
- `cdp_role_matrix_full.js`: passed
- `cdp_mobile_sweep.js`: passed
- `scripts/cdp_probe.js`: passed on clean browser state with nonce-based CSP and successful login
- live response headers now include `Cross-Origin-Opener-Policy`, `Cross-Origin-Resource-Policy`, `Origin-Agent-Cluster`, `X-Permitted-Cross-Domain-Policies`, `worker-src 'self'`, and `object-src 'none'`
- HTML shell now serves `script-src 'nonce-...'` with `script-src-attr 'none'`
- `scripts/release_gate.sh`: passed on `2026-04-09` against a fresh production-like database with `BLOOMIE_ALLOW_DEMO_DEFAULTS=false`

Remaining launch blockers:

- No launch-blocking issues remain for the current v1 scope.
- Remaining work is post-launch hardening and maintainability, not launch blockers.
