# Bloomie Launch Project Charter

## Objective

Take Bloomie from a strong prototype into a launch-ready product that is:

- secure enough for real customer pilots and launch sales
- functionally complete across core user, admin, and master workflows
- honest in positioning and market claims
- operationally testable and auditable
- founder-approved without unresolved launch blockers

## Final Acceptance Standard

Bloomie is only considered launch-ready when all of the following are true:

- Coding agents report no open critical blockers in owned areas.
- Testing agent clears the agreed launch test gates.
- UI/UX agent confirms no major trust or workflow friction remains in key journeys.
- Marketing and sales agents confirm the product can be positioned and sold without overclaiming.
- Final auditor returns `GO`.
- Founder can review the product and see no lagging critical issue in security, functionality, trust, or sellability.

## Scope

### In scope

- backend hardening
- frontend hardening
- launch-critical UX cleanup
- role-based workflow validation
- tenant isolation validation
- positioning and launch messaging
- founder-ready audit gates

### Out of scope for this charter

- speculative V2 features not needed for launch
- broad platform rewrites unless required to remove a launch blocker
- low-value visual polish unrelated to conversion, trust, or usability

## Agent Model

### 1. Backend Coding Agent

Owner:

- `backend/server.js`
- backend security and auth behavior
- tenant controls
- registration controls
- API hardening

Success criteria:

- no critical backend security blocker remains
- access control is commercially defensible
- backend supports launch positioning honestly

### 2. Frontend Coding Agent

Owner:

- `bloomie-helpdesk-v1.html`
- `service-worker.js`
- product trust signals in frontend
- launch-critical UX correctness

Success criteria:

- no frontend behavior leaks sensitive data
- no misleading AI/product claims remain on key surfaces
- user/admin/master journeys remain usable after hardening

### 3. Testing Agent

Owner:

- launch test strategy
- regression matrix
- role, tenant, security, and packaging validation plan

Success criteria:

- clear launch gates
- clear pass/fail criteria
- prioritized defect list by severity

### 4. UI/UX Agent

Owner:

- workflow clarity
- trust and credibility
- buyer-facing polish
- founder-facing functional UX recommendations

Success criteria:

- key journeys are clear
- product feels trustworthy enough to demo and sell
- friction points are explicitly identified for coding follow-up

### 5. Marketing Agent

Owner:

- ICP
- positioning
- safe product claims
- launch messaging

Success criteria:

- messaging matches current product truth
- launch narrative is commercially usable

### 6. Sales Agent

Owner:

- sellability assessment
- objections and procurement blockers
- recommended sales motion

Success criteria:

- recommended deal structure exists
- sales objections are explicit and actionable

### 7. Final Auditor

Owner:

- independent launch audit
- final go/no-go gate

Success criteria:

- all critical launch blockers either resolved or explicitly rejected as non-launch-critical

### 8. Product Manager

Owner:

- synthesis of all agents
- task sequencing
- escalation loop
- founder-ready release framework

Success criteria:

- backlog stays prioritized
- no parallel work creates hidden gaps
- work continues until audit and commercial readiness are aligned

## Workflow

### Phase 1. Establish launch blockers

- Review current repo, docs, and product surfaces.
- Identify critical blockers across security, trust, functionality, and sellability.
- Save findings into the execution backlog.

### Phase 2. Execute critical fixes

- Backend and frontend agents fix highest-severity blockers first.
- Testing agent defines and runs the next launch checks.
- UI/UX agent reviews functional trust and conversion issues.

### Phase 3. Commercial validation

- Marketing agent confirms safe claims and target segment.
- Sales agent confirms sellable motion and objections.
- Product manager converts those findings into implementation tasks where needed.

### Phase 4. Audit gate

- Final auditor reviews the product against launch standards.
- If `NO-GO`, product manager reassigns required work to the relevant agents.
- The cycle repeats until all launch-critical objections are cleared or explicitly accepted by founder decision.

## Severity Model

- `Critical`: blocks launch or safe sale
- `High`: does not block all demos, but blocks confident selling
- `Medium`: can ship with workaround, but should be tracked
- `Low`: improvement opportunity, not launch-blocking

## Founder Decision Rule

The founder should not be asked to approve around hidden technical debt. Any issue that can materially affect:

- buyer trust
- employee data security
- product truthfulness
- role/tenant correctness
- launch conversion
- implementation success in the first customer

must be surfaced before `GO`.

## Initial Priority Backlog

1. Remove launch-blocking security and data exposure risks.
2. Tighten access control and registration logic.
3. Align product messaging with actual AI and knowledge capabilities.
4. Validate user, admin, master, and tenant workflows.
5. Close top UX friction that hurts trust or adoption.
6. Produce founder-ready go/no-go report with commercial positioning.

## Deliverables

- hardened codebase
- launch blocker list with status
- testing gate checklist
- UX recommendation list
- marketing and sales positioning memo
- final audit verdict
- founder-ready go/no-go summary
