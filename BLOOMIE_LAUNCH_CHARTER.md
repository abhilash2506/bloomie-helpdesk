# Bloomie Launch Charter

## Mission
Launch Bloomie as a sellable HR helpdesk product that is trustworthy, secure enough for pilots, and honest about what it does.

## Product Goal
Bloomie should feel like a private employee support operating system:
- employees can raise and track issues
- admins can manage work, knowledge, and reports
- guided assistant responses stay grounded in configured sources
- the product can be demoed, piloted, and sold without overstating capabilities

## Non-Negotiables
- no sensitive data leakage through caching or offline behavior
- no UI copy that promises capabilities the product does not actually have
- no launch sign-off until security, UX, QA, and commercial readiness all agree
- preserve the current UX while reducing enterprise risk

## Task List

### 1. Backend Coding Agent
Owns server-side launch blockers and trust issues:
- access control
- tenant isolation
- auth/session hardening
- API safety
- production defaults

### 2. Frontend Coding Agent
Owns frontend launch blockers and trust issues:
- unsafe caching
- product honesty in visible UI copy
- assistant wording
- any frontend behavior that could overpromise

### 3. Testing Agent
Owns validation and regression control:
- role-based access checks
- tenant separation checks
- ticket/forum/report smoke tests
- desktop/mobile/PWA verification
- launch gate pass/fail recommendations

### 4. UI/UX Agent
Owns product clarity and usability:
- simplify confusing screens
- flag misleading labels
- improve trust and comprehension
- suggest changes back to coding agents

### 5. Marketing Agent
Owns positioning and sales messaging:
- ICP clarity
- launch narrative
- pricing story
- feature claims that are safe to sell

### 6. Sales Agent
Owns commercial readiness:
- pilot packaging
- objection handling
- enterprise buyer concerns
- what must be fixed before a live customer call

### 7. Final Auditor
Owns final release gate:
- compliance and market readiness review
- launch risk review
- sign-off only if the product is safe to sell

### 8. Product Manager
Owns orchestration:
- assign tasks to the right agent
- collect findings
- decide whether to continue, rework, or approve launch

## Workflow

1. Product Manager opens the launch sprint and assigns tasks.
2. Backend Coding Agent and Frontend Coding Agent fix launch blockers in parallel.
3. Testing Agent runs multi-level verification after each meaningful change.
4. UI/UX Agent reviews screens and flags anything confusing, risky, or misleading.
5. Marketing Agent and Sales Agent review the product story and buyer-facing claim set.
6. Final Auditor checks whether the product is ready to sell and whether market/compliance expectations are met.
7. If the final audit fails, Product Manager reopens the backlog and reassigns tasks until the blockers are cleared.
8. If everything passes, the product moves to launch readiness.

## Current Launch Status
- frontend hardening in progress
- unsafe service-worker caching being removed
- visible assistant copy being softened to match real behavior
- launch charter created and active

## Immediate Next Steps
- finish the frontend launch-hardening patch set
- run lightweight syntax verification
- produce a final launch-readiness summary
- hand findings to testing, UX, marketing, sales, and final audit pass

