# Bloomie Master Handoff

## Product Snapshot

- Product name: `Bloomie`
- Local desktop app: `/Users/abhilashbisht/Desktop/Bloomie.app`
- Local web URL: `http://127.0.0.1:4181/`
- Company code: `DEFAULT`

## Login Credentials

- Master: `master / Bloomie@9271#Master`
- Admin: `DEMO-ADMIN / Secure@123`
- Manager: `DEMO-MGR / Secure@123`
- User: `DEMO-USER / Secure@123`

These were reverified locally on April 2, 2026.

## Mascot Rules

- Outside app icon: `Owl` and intended to stay permanent.
- Inside app mascot: user-changeable.
- In-app default mascot: `Owl`
- Legacy `robot` mascot config is auto-migrated to `Owl`.
- Outside Owl icon was updated to better match the in-app Owl style.

## Mascot Behavior

Bloomie now behaves more like a guided assistant:

- page-aware nudges
- click-to-guide behavior
- celebration messages after successful actions
- idle follow-up prompts
- animation can be turned `on/off`

Animation toggle location:

- My Profile personalization card for every role
- Settings / Setup page for admins
- option label: `Enable mascot animation`

## Personalization Access

- Master, Admin, Manager, and User can now change:
  - mascot
  - language
  - greeting on login
  - dashboard mascot visibility
  - mascot animation
- These controls now live in `My Profile`, so non-admin roles do not need access to admin setup just to personalize Bloomie.

## Home Experience

- `Home` is now universal for every login.
- Master/Admin see the expanded admin workspace cards.
- Manager/User see the employee workspace cards, with manager conduct shortcuts added only for managers.
- The product now keeps one shared landing experience instead of making non-admin roles bypass Home entirely.

## QA Status

Verified locally:

- desktop app single-instance behavior
- backend health
- master/admin/manager/user login matrix
- role permissions
- multilingual UI sweep
- Ask Bloomie chat flow
- destructive backend QA

Scripts used:

- `QA_UAT.sh`
- `destructive_qa.js`
- `cdp_qa.js`
- `cdp_lang_matrix.js`
- `cdp_role_matrix_full.js`
- `scripts/role_matrix_local.sh`

## Current Product Assessment

What is strong:

- strong role separation
- universal role-aware home experience
- per-user Bloomie personalization in profile
- working helpdesk, tasks, conduct, reports, and settings flows
- multilingual base is working well
- desktop app now behaves much more reliably
- mascot branding is now intentional rather than generic

What still deserves the next product pass:

- final visual polish for mascot consistency across every surface
- stronger public deployment and persistence than free/demo hosting
- real push notifications if mobile-first use grows
- cleaner onboarding/tutorial for first-time users
- richer analytics for admin and manager adoption
- signed desktop/mobile distribution pipeline

## Product Manager View

Bloomie is now in a good state as a serious internal HR helpdesk product foundation. It already has enough surface area to demo real value:

- employee support
- manager conduct workflows
- admin setup and reporting
- multilingual self-service assistance

My recommendation for next priorities:

1. Stabilize branding and onboarding completely.
2. Move from demo-grade infrastructure to durable hosted infrastructure.
3. Add usage analytics and admin insight dashboards.
4. Add notification strategy across desktop/mobile.
5. Prepare signed distribution for Mac, Windows, Android, and iOS.
6. Build a tighter first-run experience for associates and managers.

## Important Notes

- Outside icon is intended to be `Owl`.
- Inside mascot can still be changed by the user unless you decide to lock it.
- macOS Finder/Dock may cache icons temporarily even after the bundle is updated.
