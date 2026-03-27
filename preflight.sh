#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

echo "== Bloomie Deployment Preflight =="

fail() {
  echo "ERROR: $1" >&2
  exit 1
}

pass() {
  echo "OK: $1"
}

warn() {
  echo "WARN: $1"
}

command -v node >/dev/null 2>&1 || fail "Node.js is required"
command -v npm >/dev/null 2>&1 || fail "npm is required"

if [[ ! -f ".env" ]]; then
  warn ".env not found. Copy .env.example to .env before production deployment."
else
  pass ".env present"
  grep -q '^BLOOMIE_SECRET=' .env || warn "BLOOMIE_SECRET missing from .env"
  grep -q '^BLOOMIE_MASTER_PASS=' .env || warn "BLOOMIE_MASTER_PASS missing from .env"
  grep -q '^BLOOMIE_BASE_URL=' .env || warn "BLOOMIE_BASE_URL missing from .env"
fi

[[ -f "backend/server.js" ]] || fail "backend/server.js missing"
[[ -f "bloomie-helpdesk-v1.html" ]] || fail "bloomie-helpdesk-v1.html missing"
[[ -f "manifest.webmanifest" ]] || fail "manifest.webmanifest missing"
[[ -f "deploy/nginx/bloomie.conf" ]] || fail "Nginx config missing"
[[ -f "deploy/systemd/bloomie.service" ]] || fail "systemd service file missing"

node --check backend/server.js >/dev/null
pass "backend syntax check passed"

node -e "const fs=require('fs');const vm=require('vm');const html=fs.readFileSync('bloomie-helpdesk-v1.html','utf8');const scripts=[...html.matchAll(/<script>([\\s\\S]*?)<\\/script>/g)].map(m=>m[1]);scripts.forEach((s,i)=>new vm.Script(s,{filename:'script'+i+'.js'}));" >/dev/null
pass "frontend script parse passed"

mkdir -p backend/data backend/logs backend/backups
pass "runtime directories ready"

echo "Preflight completed."
