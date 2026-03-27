# Bloomie Audit and Compliance Model

## Objective
Make Bloomie enterprise-trustworthy for HR operations, especially where sensitive employee issues, access changes, policy answers, and exports are involved.

## Audit Principles
- every admin action must be attributable
- every sensitive change must be timestamped
- every exported or deleted dataset must be traceable
- audit records should be append-only

## Audit Events

### Authentication
- login success
- login failure
- logout
- password reset requested
- password reset completed
- MFA enabled/disabled

### Access control
- role assigned
- role revoked
- user suspended
- user reactivated
- user deleted
- tenant created
- tenant suspended

### Ticketing
- ticket created
- ticket updated
- status changed
- HR response added
- ticket exported
- ticket deleted

### Knowledge
- source added
- source edited
- source sync run
- source sync failed
- knowledge approved
- knowledge unpublished

### Forum
- thread created
- reply posted
- answer accepted
- thread hidden/locked

### Admin operations
- settings changed
- report exported
- import run
- data cleared
- backup restored

## Audit Log Structure
- `id`
- `tenant_id`
- `actor_user_id`
- `actor_role`
- `action`
- `entity_type`
- `entity_id`
- `before_json`
- `after_json`
- `ip_address`
- `user_agent`
- `correlation_id`
- `created_at`

## Sensitive Category Controls
Categories such as POSH, misconduct, payroll dispute, disciplinary issue, and personal records should enforce:
- limited visibility
- restricted routing
- stronger access checks
- audit capture for every open/read/update/export action

## Compliance Controls
- retention configuration by tenant
- export approvals for sensitive data
- configurable data residency
- encryption at rest and in transit
- backup encryption
- key rotation policy

## Approval Workflows
- sensitive ticket export approval
- knowledge publication approval
- source activation approval
- admin role assignment approval for some plans

## Monitoring and Review
- weekly audit digest for admins
- monthly access review
- founder/platform review for high-risk events

## Minimum Production Compliance Readiness
- append-only audit logs
- RBAC
- encrypted backups
- HTTPS
- secure session cookies
- export logging
- delete logging
- admin action logging
