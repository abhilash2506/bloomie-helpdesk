#!/bin/zsh
set -euo pipefail

export PATH="/usr/bin:/bin:/usr/sbin:/sbin:/opt/homebrew/bin:$PATH"

BASE="${BASE:-http://127.0.0.1:4181}"
MASTER_PASS="${MASTER_PASS:-Bloomie@9271#Master}"
TENANT_ADMIN_PASS="${TENANT_ADMIN_PASS:-Secure@1234}"
USER_PASS="${USER_PASS:-Secure@123}"
ADMIN_PASS="${ADMIN_PASS:-Secure@123}"
STAMP=$(date +%s)

USER_EMP="QA-USER-$STAMP"
ADMIN_EMP="QA-ADMIN-$STAMP"
USER_EMAIL="qa.user.$STAMP@example.com"
ADMIN_EMAIL="qa.admin.$STAMP@example.com"

TENANT_CODE="QAT$STAMP"
TENANT_ADMIN_EMP="ADM-$STAMP"
TENANT_ADMIN_EMAIL="tenant.admin.$STAMP@example.com"

MASTER_JSON=$(curl -s -X POST "$BASE/api/auth/login" -H 'Content-Type: application/json' --data "{\"tenantCode\":\"DEFAULT\",\"identifier\":\"master\",\"password\":\"$MASTER_PASS\"}")
MASTER_TOKEN=$(printf '%s' "$MASTER_JSON" | jq -r '.token')

curl -s -X POST "$BASE/api/config/patch" \
  -H "Authorization: Bearer $MASTER_TOKEN" \
  -H 'Content-Type: application/json' \
  --data '{"registration":{"allowSelfRegistration":true,"allowManagerSelfRegistration":false,"allowedEmailDomains":[]}}' \
  >/tmp/default_reg_open.json

curl -s -X POST "$BASE/api/master/tenants" \
  -H "Authorization: Bearer $MASTER_TOKEN" \
  -H 'Content-Type: application/json' \
  --data "{\"code\":\"$TENANT_CODE\",\"name\":\"QA Tenant $STAMP\",\"plan\":\"enterprise\",\"primaryDomain\":\"qa-$STAMP.local\",\"adminName\":\"Tenant Admin\",\"adminEmail\":\"$TENANT_ADMIN_EMAIL\",\"adminEmpId\":\"$TENANT_ADMIN_EMP\",\"adminPassword\":\"$TENANT_ADMIN_PASS\"}" \
  >/tmp/qa_tenant.json

curl -s -X POST "$BASE/api/auth/register" \
  -H 'Content-Type: application/json' \
  --data "{\"tenantCode\":\"DEFAULT\",\"name\":\"QA User\",\"empId\":\"$USER_EMP\",\"email\":\"$USER_EMAIL\",\"dept\":\"Operations\",\"property\":\"HQ\",\"password\":\"$USER_PASS\"}" \
  >/tmp/reg_user.json

curl -s -X POST "$BASE/api/auth/register" \
  -H 'Content-Type: application/json' \
  --data "{\"tenantCode\":\"DEFAULT\",\"name\":\"QA Admin\",\"empId\":\"$ADMIN_EMP\",\"email\":\"$ADMIN_EMAIL\",\"dept\":\"People Ops\",\"property\":\"HQ\",\"password\":\"$ADMIN_PASS\"}" \
  >/tmp/reg_admin.json

curl -s -X PATCH "$BASE/api/admin/users/$ADMIN_EMP/role" \
  -H "Authorization: Bearer $MASTER_TOKEN" \
  -H 'Content-Type: application/json' \
  --data '{"role":"admin"}' \
  >/tmp/promote_admin.json

USER_JSON=$(curl -s -X POST "$BASE/api/auth/login" -H 'Content-Type: application/json' --data "{\"tenantCode\":\"DEFAULT\",\"identifier\":\"$USER_EMP\",\"password\":\"$USER_PASS\"}")
USER_TOKEN=$(printf '%s' "$USER_JSON" | jq -r '.token')

ADMIN_JSON=$(curl -s -X POST "$BASE/api/auth/login" -H 'Content-Type: application/json' --data "{\"tenantCode\":\"DEFAULT\",\"identifier\":\"$ADMIN_EMP\",\"password\":\"$ADMIN_PASS\"}")
ADMIN_TOKEN=$(printf '%s' "$ADMIN_JSON" | jq -r '.token')

TENANT_ADMIN_JSON=$(curl -s -X POST "$BASE/api/auth/login" -H 'Content-Type: application/json' --data "{\"tenantCode\":\"$TENANT_CODE\",\"identifier\":\"$TENANT_ADMIN_EMP\",\"password\":\"$TENANT_ADMIN_PASS\"}")
TENANT_ADMIN_TOKEN=$(printf '%s' "$TENANT_ADMIN_JSON" | jq -r '.token')

USER_REPORTS=$(curl -s -o /tmp/bloomie_user_reports.json -w '%{http_code}' "$BASE/api/reports/summary" -H "Authorization: Bearer $USER_TOKEN")
ADMIN_REPORTS=$(curl -s -o /tmp/bloomie_admin_reports.json -w '%{http_code}' "$BASE/api/reports/summary" -H "Authorization: Bearer $ADMIN_TOKEN")
USER_BACKUP=$(curl -s -o /tmp/bloomie_user_backup.json -w '%{http_code}' -X POST "$BASE/api/master/backups/create" -H "Authorization: Bearer $USER_TOKEN")
ADMIN_BACKUP=$(curl -s -o /tmp/bloomie_admin_backup.json -w '%{http_code}' -X POST "$BASE/api/master/backups/create" -H "Authorization: Bearer $ADMIN_TOKEN")
MASTER_BACKUP=$(curl -s -o /tmp/bloomie_master_backup.json -w '%{http_code}' -X POST "$BASE/api/master/backups/create" -H "Authorization: Bearer $MASTER_TOKEN")

curl -s -X POST "$BASE/api/config/patch" \
  -H "Authorization: Bearer $TENANT_ADMIN_TOKEN" \
  -H 'Content-Type: application/json' \
  --data '{"policyUrl":"","sheetUrl":"","sopUrl":"","misconductUrl":"","importantTopics":"","knowledgeFiles":[]}' \
  >/tmp/cfg_clear.json

UNCONFIG=$(curl -s "$BASE/api/bootstrap" -H "Authorization: Bearer $TENANT_ADMIN_TOKEN" | jq '{tenant:.tenant.code,knowledgeCount:([.config.sheetUrl,.config.policyUrl,.config.sopUrl,.config.misconductUrl,.config.importantTopics] | map(select(. != null and . != "")) | length),forumPosts:(.forum.posts|length),forumReplies:(.forum.replies|length)}')

curl -s -X POST "$BASE/api/config/patch" \
  -H "Authorization: Bearer $TENANT_ADMIN_TOKEN" \
  -H 'Content-Type: application/json' \
  --data '{"policyUrl":"https://example.com/policy.pdf","importantTopics":"leave,payroll,posh"}' \
  >/tmp/cfg_set.json

CONFIG=$(curl -s "$BASE/api/bootstrap" -H "Authorization: Bearer $TENANT_ADMIN_TOKEN" | jq '{tenant:.tenant.code,knowledgeCount:([.config.sheetUrl,.config.policyUrl,.config.sopUrl,.config.misconductUrl,.config.importantTopics] | map(select(. != null and . != "")) | length),forumPosts:(.forum.posts|length),forumReplies:(.forum.replies|length)}')

TICKET_JSON=$(curl -s -X POST "$BASE/api/tickets" -H "Authorization: Bearer $MASTER_TOKEN" -H 'Content-Type: application/json' --data '{"category":"QA Delete","priority":"Low","status":"open","desc":"delete me","timeline":[]}')
TICKET_ID=$(printf '%s' "$TICKET_JSON" | jq -r '.ticket.id')
MASTER_DELETE=$(curl -s -o /tmp/ticket_delete_master.json -w '%{http_code}' -X DELETE "$BASE/api/tickets/$TICKET_ID" -H "Authorization: Bearer $MASTER_TOKEN")
USER_DELETE=$(curl -s -o /tmp/ticket_delete_user.json -w '%{http_code}' -X DELETE "$BASE/api/tickets/$TICKET_ID" -H "Authorization: Bearer $USER_TOKEN")

printf 'master_token=%s\n' "$([ "$MASTER_TOKEN" != 'null' ] && echo ok || echo fail)"
printf 'tenant_admin_token=%s\n' "$([ "$TENANT_ADMIN_TOKEN" != 'null' ] && echo ok || echo fail)"
printf 'admin_token=%s\n' "$([ "$ADMIN_TOKEN" != 'null' ] && echo ok || echo fail)"
printf 'user_token=%s\n' "$([ "$USER_TOKEN" != 'null' ] && echo ok || echo fail)"
printf 'user_reports=%s admin_reports=%s\n' "$USER_REPORTS" "$ADMIN_REPORTS"
printf 'user_backup=%s admin_backup=%s master_backup=%s\n' "$USER_BACKUP" "$ADMIN_BACKUP" "$MASTER_BACKUP"
printf 'unconfigured=%s\n' "$UNCONFIG"
printf 'configured=%s\n' "$CONFIG"
printf 'master_delete=%s user_delete=%s\n' "$MASTER_DELETE" "$USER_DELETE"
