#!/bin/zsh
set -euo pipefail

export PATH="/opt/homebrew/bin:/usr/bin:/bin:/usr/sbin:/sbin:$PATH"

ROOT="/Users/abhilashbisht/Desktop/Bloomie-Helpdesk"
BASE="${BASE:-http://127.0.0.1:4181}"
APP_URL="${APP_URL:-$BASE/}"
CDP_HTTP="${CDP_HTTP:-http://127.0.0.1:9222}"
MASTER_PASS="${MASTER_PASS:-Bloomie@9271#Master}"

echo "release_gate=starting"

node --check "$ROOT/backend/server.js"
node --check "$ROOT/cdp_qa.js"
node --check "$ROOT/cdp_role_matrix_full.js"
node --check "$ROOT/cdp_mobile_sweep.js"
node --check "$ROOT/scripts/cdp_probe.js"

node -e "const fs=require('fs');const html=fs.readFileSync('$ROOT/bloomie-helpdesk-v1.html','utf8');const matches=[...html.matchAll(/<script[^>]*>([\\s\\S]*?)<\\/script>/gi)];for(const m of matches){const s=m[1].trim();if(s)new Function(s);}console.log('inline_script_parse=ok');"

bash "$ROOT/deploy/preflight.sh"

ROOT_HEADERS=$(curl -sI "$BASE/")
printf '%s\n' "$ROOT_HEADERS" | grep -q "script-src-attr 'none'"
printf '%s\n' "$ROOT_HEADERS" | grep -q "script-src 'self' 'nonce-"
printf '%s\n' "$ROOT_HEADERS" | grep -q "Cross-Origin-Opener-Policy: same-origin"
printf '%s\n' "$ROOT_HEADERS" | grep -q "Cross-Origin-Resource-Policy: same-origin"

UAT_OUTPUT=$(BASE="$BASE" MASTER_PASS="$MASTER_PASS" "$ROOT/QA_UAT.sh")
printf '%s\n' "$UAT_OUTPUT"
printf '%s\n' "$UAT_OUTPUT" | grep -q "master_token=ok"
printf '%s\n' "$UAT_OUTPUT" | grep -q "tenant_admin_token=ok"
printf '%s\n' "$UAT_OUTPUT" | grep -q "admin_token=ok"
printf '%s\n' "$UAT_OUTPUT" | grep -q "user_token=ok"
printf '%s\n' "$UAT_OUTPUT" | grep -q "user_reports=403 admin_reports=200"
printf '%s\n' "$UAT_OUTPUT" | grep -q "user_backup=403 admin_backup=403 master_backup=201"
printf '%s\n' "$UAT_OUTPUT" | grep -q "master_delete=200 user_delete=403"

PROBE_OUTPUT=$(APP_URL="$APP_URL" CDP_HTTP="$CDP_HTTP" MASTER_PASS="$MASTER_PASS" node "$ROOT/scripts/cdp_probe.js")
printf '%s\n' "$PROBE_OUTPUT"
printf '%s\n' "$PROBE_OUTPUT" | grep -q '"inlineHandlers": 0'
printf '%s\n' "$PROBE_OUTPUT" | grep -q '"appVisible": true'
printf '%s\n' "$PROBE_OUTPUT" | grep -q '"loginVisible": false'

MOBILE_OUTPUT=$(APP_URL="$APP_URL" CDP_HTTP="$CDP_HTTP" MASTER_PASS="$MASTER_PASS" node "$ROOT/cdp_mobile_sweep.js")
printf '%s\n' "$MOBILE_OUTPUT"
printf '%s\n' "$MOBILE_OUTPUT" | grep -q '"ok": true'
printf '%s\n' "$MOBILE_OUTPUT" | grep -q '"loginVisible": false'

echo "release_gate=passed"
