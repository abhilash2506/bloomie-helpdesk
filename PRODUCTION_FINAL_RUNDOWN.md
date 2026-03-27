# Bloomie Production Final Rundown

## Current State
Bloomie currently runs as a browser-local single-file application.

What it already does well:
- role-based UX for `Master Admin`, `Admin`, and `User`
- ticketing, tracking, knowledge base, forum, and Bloomie assistant
- per-user chat memory on the local device
- admin assignment and basic lifecycle controls
- responsive browser experience for mobile and desktop

What it is not yet:
- a production-safe multi-tenant SaaS or on-prem enterprise platform
- a backend-governed system of record
- a compliant audit-grade HR service platform

## Core Gaps To Close
These are the real production blockers.

### 1. Server-side auth and role enforcement
Current risk:
- roles are still frontend-controlled at runtime
- browser storage remains part of the trust boundary

Required fix:
- identity service with server-issued sessions
- role checks enforced on every API route
- master/admin/user permissions defined centrally

### 2. Multi-tenancy
Current risk:
- there is no true client isolation
- one browser instance behaves like one logical tenant

Required fix:
- tenant table and tenant-scoped data model
- tenant-aware auth, branding, settings, KB, tickets, and reports
- founder/master console for tenant provisioning

### 3. Database-backed entities
Current risk:
- users, tickets, forum posts, and settings live in local storage
- data is device-bound and easy to tamper with

Required fix:
- relational database for users, tenants, roles, tickets, KB sources, sessions, audit logs, and reports
- object storage for uploaded files

### 4. Password and session security
Current risk:
- local credential authority still exists for the prototype

Required fix:
- hashed passwords only on backend using Argon2id or bcrypt
- signed httpOnly secure cookies or signed JWT with rotation
- MFA optional for master/founder access
- password reset and invite flow

### 5. Audit and compliance
Current risk:
- no authoritative audit trail
- no retention or evidence model

Required fix:
- immutable audit log for login, role changes, ticket updates, KB edits, exports, imports, deletions
- retention policies
- tenant-level access review
- compliance controls for POSH/safety/confidential cases

### 6. Knowledge trust and citations
Current risk:
- citations are heuristic and frontend-generated
- no source freshness or approval state

Required fix:
- source ingestion service
- document parsing and indexing
- source-level versioning
- answer citations with source ID, title, timestamp, and confidence
- approval workflow for published knowledge

### 7. Reporting and observability
Current risk:
- reporting is local and snapshot-level only

Required fix:
- tenant dashboards
- SLA breach trends
- category heatmaps
- Bloomie deflection rate
- source usage and citation coverage
- app logs, error monitoring, uptime monitoring

### 8. Backup and disaster recovery
Current risk:
- browser local state is fragile

Required fix:
- encrypted scheduled backups
- restore workflow
- tenant-scoped export/import

### 9. Deployment controls
Current risk:
- no secure deployment path yet

Required fix:
- HTTPS
- environment separation: dev, staging, prod
- secret management
- WAF/rate limits
- CI/CD and release approvals

## Suggested Production Architecture

### Frontend
- Web app: React or Next.js
- PWA-ready shell
- responsive UI for desktop and mobile

### Backend
- Node.js/NestJS or FastAPI
- REST or GraphQL API
- RBAC middleware
- audit middleware

### Data
- PostgreSQL
- Redis for sessions, queues, throttling
- S3-compatible object storage for files

### Search / Knowledge
- PostgreSQL full-text search to start
- optional vector index later if retrieval improves quality

### Authentication
- email/password with invite flow
- SSO later: Google Workspace, Microsoft Entra, Okta
- signed secure sessions

### Infra
- Docker
- Nginx / managed ingress
- HTTPS with managed certificates
- backups + monitoring + log aggregation

## Recommended Milestone Order

### Phase 1. Foundation
- backend repo
- tenant model
- user model
- auth + sessions
- PostgreSQL schema
- API gateway

### Phase 2. Core service desk
- tickets API
- comments and timeline
- file uploads
- role enforcement
- reporting basics

### Phase 3. Bloomie knowledge trust
- source ingestion
- citations
- source freshness
- confidence and escalation rules

### Phase 4. Enterprise readiness
- audit logs
- exports and encrypted backups
- SSO
- tenant admin console
- production deployment controls

## Final Recommendation
Do not keep stretching the single HTML file if the goal is production use by organizations.

The correct next move is:
1. freeze the prototype as UX reference
2. build the backend-first production version
3. migrate features into a proper app architecture

This is the cleanest path to multi-tenant trust, compliance, and scale.
