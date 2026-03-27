# Bloomie QA Hardening Report

Date: 2026-03-27

## Canonical Entry

- Canonical app entry: `bloomie-helpdesk-v1.html`
- Duplicate numbered HTML variants were removed.
- Backend static serving now targets the canonical file only.

## Build Validation

- `node --check backend/server.js` passed
- Frontend inline script parse check passed
- `http://127.0.0.1:4181/` returned `200 OK`

## Hardening Changes Completed

- Added per-user page persistence so refresh restores the last active page.
- Added Master-only ticket deletion in frontend and backend.
- Removed duplicate HTML entry confusion by keeping one canonical HTML file.
- Knowledge Base no longer shows bundled legacy FAQ content when no published knowledge exists.
- Fresh unconfigured tenants now stay empty for knowledge/forum seeded state.
- Forum and chat empty/fallback behavior now align better with configured vs unconfigured tenants.
- Added/extended localization coverage for key chat, KB, and forum runtime surfaces.

## Live UAT Results

Script: `QA_UAT.sh`

Latest successful run:

- `master_token=ok`
- `tenant_admin_token=ok`
- `admin_token=ok`
- `user_token=ok`
- `user_reports=403`
- `admin_reports=200`
- `user_backup=403`
- `admin_backup=403`
- `master_backup=201`
- `unconfigured tenant`: `knowledgeCount=0`, `forumPosts=0`, `forumReplies=0`
- `configured tenant`: `knowledgeCount=2`, `forumPosts=0`, `forumReplies=0`
- `master_delete=200`
- `user_delete=403`

## Product Readiness Assessment

Improved materially:

- deployment hygiene
- tenant-state consistency
- destructive-action controls
- role-based permission enforcement
- refresh behavior

Still not honestly a `100/100` sign-off:

- localization is still not exhaustively completed across every page, modal, toast, report label, and admin form in every supported language
- browser automation was not run end-to-end across all flows
- mobile and desktop were hardened via responsive layout and code-path review, but not fully regression-tested in a browser matrix
- configured knowledge still does not produce real parsed/published KB articles unless actual ingestion content is available

## Recommended Final Gate Before Market Sign-Off

1. Full visual localization sweep page-by-page in every supported language.
2. Manual browser UAT on desktop and mobile for:
   - Master Admin
   - Admin
   - User
   - fresh unconfigured tenant
   - configured tenant
3. One final deployment rehearsal using the intended production setup.
