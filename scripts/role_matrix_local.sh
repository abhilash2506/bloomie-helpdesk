#!/bin/zsh
set -euo pipefail

export PATH="/opt/homebrew/bin:/usr/bin:/bin:/usr/sbin:/sbin:$PATH"

BASE='http://127.0.0.1:4181'

MASTER_JSON=$(curl -s -X POST "$BASE/api/auth/login" -H 'Content-Type: application/json' --data '{"tenantCode":"DEFAULT","identifier":"master","password":"Bloomie@9271#Master"}')
MASTER_TOKEN=$(printf '%s' "$MASTER_JSON" | jq -r '.token')

ensure_user() {
  local emp="$1"
  local name="$2"
  local email="$3"
  local pass="$4"
  local user_type="$5"
  local role="$6"

  curl -s -X POST "$BASE/api/auth/register" \
    -H 'Content-Type: application/json' \
    --data "{\"tenantCode\":\"DEFAULT\",\"name\":\"$name\",\"empId\":\"$emp\",\"email\":\"$email\",\"dept\":\"Demo\",\"property\":\"HQ\",\"userType\":\"$user_type\",\"password\":\"$pass\"}" \
    >/tmp/"$emp"_register.json || true

  if [[ "$role" == "admin" ]]; then
    curl -s -X PATCH "$BASE/api/admin/users/$emp/role" \
      -H "Authorization: Bearer $MASTER_TOKEN" \
      -H 'Content-Type: application/json' \
      --data '{"role":"admin"}' \
      >/tmp/"$emp"_role.json || true
  fi

  if [[ "$user_type" == "manager" ]]; then
    curl -s -X PATCH "$BASE/api/admin/users/$emp/type" \
      -H "Authorization: Bearer $MASTER_TOKEN" \
      -H 'Content-Type: application/json' \
      --data '{"userType":"manager"}' \
      >/tmp/"$emp"_type.json || true
  fi
}

login_and_check() {
  local label="$1"
  local emp="$2"
  local pass="$3"

  local json
  json=$(curl -s -X POST "$BASE/api/auth/login" -H 'Content-Type: application/json' --data "{\"tenantCode\":\"DEFAULT\",\"identifier\":\"$emp\",\"password\":\"$pass\"}")
  local token
  token=$(printf '%s' "$json" | jq -r '.token')
  local role
  role=$(printf '%s' "$json" | jq -r '.user.role + "/" + .user.userType')
  local boot
  boot=$(curl -s "$BASE/api/bootstrap" -H "Authorization: Bearer $token")
  local users_type
  users_type=$(printf '%s' "$boot" | jq -r 'if has("users") and .users != null then (.users|type) else "null" end')
  local tasks_count
  tasks_count=$(printf '%s' "$boot" | jq -r 'if has("tasks") and .tasks != null then (.tasks|length) else 0 end')
  local manager_type
  manager_type=$(printf '%s' "$boot" | jq -r 'if has("managerActions") and .managerActions != null then (.managerActions|type) else "null" end')

  printf '%s login=%s role=%s users=%s tasks=%s managerActions=%s\n' \
    "$label" \
    "$([[ "$token" != "null" ]] && echo ok || echo fail)" \
    "$role" \
    "$users_type" \
    "$tasks_count" \
    "$manager_type"
}

ensure_user 'DEMO-ADMIN' 'Demo Admin' 'demo.admin@bloomie.local' 'Secure@123' 'associate' 'admin'
ensure_user 'DEMO-MGR' 'Demo Manager' 'demo.manager@bloomie.local' 'Secure@123' 'manager' 'user'
ensure_user 'DEMO-USER' 'Demo User' 'demo.user@bloomie.local' 'Secure@123' 'associate' 'user'

login_and_check 'Master' 'master' 'Bloomie@9271#Master'
login_and_check 'Admin' 'DEMO-ADMIN' 'Secure@123'
login_and_check 'Manager' 'DEMO-MGR' 'Secure@123'
login_and_check 'User' 'DEMO-USER' 'Secure@123'
