# Bloomie PRD

## Product Name
Bloomie

## Product Summary
Bloomie is a private employee support platform for organizations that want a smart HR helpdesk with guided answers, ticketing, knowledge reuse, and community support without depending entirely on public AI systems.

## Problem
Organizations struggle with:
- repetitive HR queries across payroll, leave, onboarding, referral, policy, POSH, and misconduct
- fragmented employee support across email, chat, spreadsheets, and verbal escalation
- lack of a trusted internal answer layer backed by company-approved sources
- poor visibility into recurring issues and SLA performance

## Goal
Create a role-based employee support platform that:
- helps employees get answers quickly
- routes complex or sensitive cases into tracked tickets
- gives admins operational control and reporting
- allows founder/master oversight across client organizations

## Success Metrics
- 30%+ reduction in repetitive HR queries
- 40%+ increase in employee self-service resolution
- 90%+ ticket acknowledgment within SLA
- measurable Bloomie deflection rate
- admin time saved per 100 employees
- tenant onboarding time under 1 day

## Users

### 1. Master Admin
Founder-level control.

Needs:
- create and manage client organizations
- provision admins
- oversee compliance, roles, and tenant settings

### 2. Admin
Internal HR/helpdesk operators.

Needs:
- manage tickets
- configure sources and settings
- review forum and knowledge
- monitor reports

### 3. User
Employees.

Needs:
- raise ticket
- track ticket
- ask Bloomie
- read KB
- use company forum
- submit referral
- raise POSH/safety concerns

## Core Scope

### Employee scope
- Raise a Ticket
- Track Ticket
- Ask Bloomie
- Knowledge Base
- Community Forum
- POSH / Safety
- Employee Referral
- My Recent Tickets

### Admin scope
- Admin panel
- all tickets
- ticket lifecycle actions
- reporting
- settings
- knowledge source setup
- HRMS integrations

### Master scope
- client provisioning
- admin lifecycle
- tenant oversight
- security settings
- audit visibility

## Functional Requirements

### Authentication and access
- server-side auth
- tenant-aware login
- invite-based admin creation
- user registration or invited user flow
- session expiry and revocation

### Ticketing
- category-based ticket creation
- SLA assignment
- status updates
- internal notes
- employee-visible updates
- export and reporting

### Ask Bloomie
- source-backed answers
- citations per answer
- escalation path to ticket
- multilingual support
- conversation memory per user
- confidence-based fallback

### Knowledge
- policy, SOP, misconduct, and sheet sources
- source sync status
- approval workflow
- versioning
- searchable articles

### Forum
- reusable public Q&A
- accepted answers
- moderator/admin controls
- convert thread into article or ticket

### Reporting
- ticket volume
- SLA breaches
- category trends
- response time
- Bloomie answer usage
- deflection rate
- tenant/admin comparison

### Compliance and security
- audit logs
- sensitive-category controls
- export controls
- encryption
- retention policies
- tenant separation

## Non-functional Requirements
- mobile-friendly web experience
- desktop-friendly admin experience
- PWA compatibility
- secure-by-default architecture
- tenant isolation
- observability and backup strategy

## Out of Scope For Prototype
- native mobile apps
- advanced workflow automation marketplace
- full generative AI orchestration layer
- external marketplace integrations beyond core HRMS/docs

## Risks
- weak trust if citations are absent
- low enterprise readiness without audit and compliance
- architecture debt if prototype is extended instead of rebuilt properly

## Release Plan

### MVP Production
- backend auth
- tenant model
- tickets
- roles
- Bloomie with citations
- admin panel
- reporting basics

### V2
- SSO
- advanced reports
- KB approvals
- forum moderation
- app packaging

### V3
- workflow automation
- advanced analytics
- multi-channel notifications
- marketplace connectors
