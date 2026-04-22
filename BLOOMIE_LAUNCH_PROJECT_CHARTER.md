# Bloomie Launch Project Charter

## Objective

Take Bloomie from a strong prototype / pilot candidate to a launch-ready product that a founder can sell without avoidable trust, security, product, or go-to-market gaps.

## Final Acceptance Standard

Bloomie is only `GO` for launch when all of the following are true:

- founder can demo and sell it without overstating the product
- core employee, admin, and master workflows work reliably
- launch-blocking security and privacy risks are closed
- UI/UX is coherent, trustworthy, and operationally usable
- testing coverage is strong enough for a market launch decision
- auditor and sales review both confirm product readiness

## Launch Outcome

Target launch position for v1:

`A private multilingual HR helpdesk with ticketing, guided employee support, knowledge sync, reporting, and role-based admin control.`

Do not position v1 as:

- compliance-grade enterprise platform without qualification
- fully citation-grounded AI copilot
- self-serve scale SaaS requiring near-zero implementation

## Current Program Status

Overall status: `Execution Started`

Current commercial posture:

- `GO` for founder-led managed pilots after critical launch blockers are cleared
- `NO-GO` for broad launch, self-serve launch, or enterprise overclaiming until final audit returns GO

Known launch blockers at kickoff:

- unsafe PWA caching behavior for authenticated data
- self-registration and access control hardening gaps
- default secret / master credential hardening requirements
- product-trust gap between AI positioning and actual behavior
- incomplete test and launch gate coverage

## Workstreams

### 1. Backend Coding Agent

Owner:
- backend security
- auth / registration controls
- tenant isolation checks
- API hardening
- operational safeguards

Definition of done:
- backend launch blockers materially reduced
- behavior documented where product or ops impact exists
- lightweight verification completed

### 2. Frontend Coding Agent

Owner:
- secure frontend behavior
- PWA safety
- trustworthy product copy
- critical UX hardening tied to launch risk

Definition of done:
- no sale-blocking frontend privacy issue remains open
- UX reflects actual product capability
- frontend validation completed

### 3. Testing Agent

Owner:
- create launch-oriented testing strategy
- define regression, security, role, tenant, PWA, desktop, mobile, and smoke suites
- run or specify gates for each release candidate

Definition of done:
- current risk report delivered
- launch test plan prioritized
- pass/fail recommendation given

### 4. UI/UX Agent

Owner:
- review each major workflow for clarity, trust, hierarchy, and friction
- identify usability gaps and misleading states
- give concrete recommendations to coding agents

Definition of done:
- UX issues categorized by severity
- actionable changes assigned

### 5. Marketing Agent

Owner:
- positioning clarity
- messaging discipline
- market promise vs product reality check

Definition of done:
- v1 positioning and no-go claims clearly defined

### 6. Sales Agent

Owner:
- sales readiness
- objection handling
- launch packaging
- commercial suitability for ICP

Definition of done:
- confirms whether Bloomie can be sold now, and how

### 7. Final Auditor

Owner:
- final launch readout across security, functionality, trust, and release readiness

Definition of done:
- issues final `GO` or `NO-GO`

### 8. Product Manager

Owner:
- aggregate findings from all agents
- assign next tasks
- reopen workstreams until all critical reviews are green

Definition of done:
- no critical blocker remains unresolved or unowned

## Workflow

1. Product Manager creates or updates the launch backlog.
2. Coding agents fix launch blockers in parallel where scopes do not overlap.
3. UI/UX Agent reviews current flows and feeds concrete changes back to coding.
4. Testing Agent validates completed work and updates launch risk.
5. Marketing and Sales review product truthfulness and market sellability.
6. Final Auditor checks all evidence and issues `GO` or `NO-GO`.
7. If `NO-GO`, Product Manager reassigns tasks and repeats the loop until all launch gates pass.

## Priority Backlog

### Phase 1: Launch Blockers

- disable unsafe caching for authenticated and API traffic
- harden registration and tenant access controls
- remove or contain insecure defaults
- align AI copy with actual product capability
- define and execute launch smoke tests

### Phase 2: Launch Reliability

- role-based regression pass
- tenant isolation regression pass
- desktop / mobile / PWA validation
- onboarding and first-run improvements
- release checklist and rollback plan

### Phase 3: Market Readiness

- tighten positioning and sales narrative
- create launch checklist for founder demo and pilot onboarding
- finalize pricing / packaging assumptions

## Launch Gates

Bloomie cannot launch until all gates below are green:

- Security Gate
- Functional Gate
- Role and Tenant Gate
- UI/UX Gate
- Testing Gate
- Market Honesty Gate
- Founder Confidence Gate

## Reporting Format

Each agent must report:

- what was checked
- what changed or what was found
- remaining blockers
- recommendation: `GO`, `GO WITH CONDITIONS`, or `NO-GO`

## Founder Rule

If any critical agent says `NO-GO`, Bloomie is not considered launch-ready.

If Marketing or Sales identifies a promise/reality mismatch, Product Manager must convert that into either:

- a product task
- a messaging correction
- or both

until the founder can sell the product without lagging, hedging, or misrepresenting what it does.
