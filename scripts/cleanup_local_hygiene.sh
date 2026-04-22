#!/bin/zsh
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
DB_PATH="$ROOT_DIR/backend/data/bloomie.sqlite"

cd "$ROOT_DIR"

rm -rf dist dist-app dist-mobile
rm -f proof-*.png session.json

if [[ -f "$DB_PATH" ]]; then
  sqlite3 "$DB_PATH" <<'SQL'
PRAGMA foreign_keys = OFF;
BEGIN IMMEDIATE;

CREATE TEMP TABLE keep_tenants (id TEXT PRIMARY KEY);
INSERT INTO keep_tenants (id) VALUES
  ('tenant_default'),
  ('tenant_clienta'),
  ('tenant_antara');

DELETE FROM sessions WHERE tenant_id NOT IN (SELECT id FROM keep_tenants);
DELETE FROM notifications WHERE tenant_id NOT IN (SELECT id FROM keep_tenants);
DELETE FROM disciplinary_actions WHERE tenant_id NOT IN (SELECT id FROM keep_tenants);
DELETE FROM forum_replies WHERE tenant_id NOT IN (SELECT id FROM keep_tenants);
DELETE FROM forum_posts WHERE tenant_id NOT IN (SELECT id FROM keep_tenants);
DELETE FROM tickets WHERE tenant_id NOT IN (SELECT id FROM keep_tenants);
DELETE FROM source_snapshots WHERE tenant_id NOT IN (SELECT id FROM keep_tenants);
DELETE FROM knowledge_sources WHERE tenant_id NOT IN (SELECT id FROM keep_tenants);
DELETE FROM sso_providers WHERE tenant_id NOT IN (SELECT id FROM keep_tenants);
DELETE FROM audit_logs WHERE tenant_id NOT IN (SELECT id FROM keep_tenants);
DELETE FROM users WHERE tenant_id NOT IN (SELECT id FROM keep_tenants);
DELETE FROM tenants WHERE id NOT IN (SELECT id FROM keep_tenants);

CREATE TEMP TABLE keep_default_users (id TEXT PRIMARY KEY);
INSERT INTO keep_default_users (id)
SELECT id
FROM users
WHERE tenant_id = 'tenant_default'
  AND emp_id IN ('SYS-000', 'DEMO-ADMIN', 'DEMO-USER', 'DEMO-MGR');

DELETE FROM sessions
WHERE tenant_id = 'tenant_default'
  AND user_id NOT IN (SELECT id FROM keep_default_users);

DELETE FROM notifications
WHERE tenant_id = 'tenant_default'
  AND user_id NOT IN (SELECT id FROM keep_default_users);

DELETE FROM disciplinary_actions
WHERE tenant_id = 'tenant_default'
  AND (
    created_by_user_id NOT IN (SELECT id FROM keep_default_users)
    OR target_user_id NOT IN (SELECT id FROM keep_default_users)
  );

DELETE FROM forum_replies
WHERE tenant_id = 'tenant_default'
  AND author_user_id NOT IN (SELECT id FROM keep_default_users);

DELETE FROM forum_posts
WHERE tenant_id = 'tenant_default'
  AND author_user_id NOT IN (SELECT id FROM keep_default_users);

DELETE FROM tickets
WHERE tenant_id = 'tenant_default'
  AND submitted_by_user_id NOT IN (SELECT id FROM keep_default_users);

DELETE FROM audit_logs
WHERE tenant_id = 'tenant_default'
  AND actor_user_id IS NOT NULL
  AND actor_user_id NOT IN (SELECT id FROM keep_default_users);

DELETE FROM users
WHERE tenant_id = 'tenant_default'
  AND id NOT IN (SELECT id FROM keep_default_users);

COMMIT;
VACUUM;
SQL
fi

echo "local_hygiene=done"
