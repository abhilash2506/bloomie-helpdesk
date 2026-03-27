# Bloomie Backend Tenant Model

## Objective
Support multiple client organizations safely with strict tenant isolation, founder-level oversight, admin-level operations, and employee-level usage.

## Tenancy Model

### Entity hierarchy
- `platform`
- `tenant`
- `site_or_business_unit` (optional)
- `user`
- `role_assignment`

### Recommended tenant strategy
- single shared application
- tenant-scoped database rows
- strict row-level tenant isolation in service layer
- optional separate database/schema for enterprise clients later

## Core Tables

### tenants
- `id`
- `tenant_code`
- `name`
- `status` (`active`, `suspended`, `trial`, `archived`)
- `plan`
- `primary_domain`
- `data_residency_region`
- `branding_config`
- `security_policy_config`
- `created_at`
- `updated_at`

### tenant_domains
- `id`
- `tenant_id`
- `domain`
- `is_primary`
- `verification_status`

### users
- `id`
- `tenant_id`
- `employee_code`
- `name`
- `email`
- `phone`
- `status`
- `password_hash`
- `password_algo`
- `password_updated_at`
- `mfa_enabled`
- `last_login_at`
- `created_at`
- `updated_at`

### roles
- `id`
- `code`
- `name`

Base roles:
- `platform_master`
- `tenant_admin`
- `tenant_user`
- `auditor`

### role_assignments
- `id`
- `tenant_id`
- `user_id`
- `role_id`
- `assigned_by`
- `assigned_at`

### sessions
- `id`
- `tenant_id`
- `user_id`
- `session_token_hash`
- `device_info`
- `ip_address`
- `expires_at`
- `revoked_at`
- `created_at`

## Tenant Isolation Rules
- every business object must include `tenant_id`
- every authenticated request must resolve `tenant_id`
- no cross-tenant read or write without explicit platform-master privileges
- platform-master actions should be logged separately

## Tenant Provisioning Flow
1. founder creates tenant
2. system generates tenant record and default config
3. founder creates or invites first `tenant_admin`
4. tenant admin completes setup
5. users register or are invited under tenant rules

## Role Enforcement

### Platform Master
- create, suspend, archive tenants
- assign tenant admins
- view platform-wide health and audit summaries

### Tenant Admin
- manage users within own tenant
- assign admin seats if allowed by plan
- manage tickets, KB, reports, sources
- view tenant audit logs

### Tenant User
- raise/track tickets
- use Bloomie
- use KB/forum/referrals based on tenant policy

## Security Rules
- every service call requires authenticated user context
- every query is tenant-scoped
- admin actions require both role check and tenant scope check
- founder actions must never reuse tenant-admin-only endpoints

## Recommended Stack
- backend: NestJS or FastAPI
- database: PostgreSQL
- cache/session: Redis
- files: S3-compatible object storage

## Migration Path From Current Prototype
1. move users/tickets/forum/settings into backend tables
2. add tenant bootstrap endpoint
3. replace local auth with backend sessions
4. keep current HTML only as UI reference while frontend is rebuilt
