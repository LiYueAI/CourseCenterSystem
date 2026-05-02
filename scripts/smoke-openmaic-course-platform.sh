#!/usr/bin/env bash
set -Eeuo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ENV_FILE="${ENV_FILE:-$ROOT_DIR/nextjs/.env.host}"
COOKIE_JAR=""
TMP_DIR=""

log() { printf '[smoke] %s\n' "$*"; }
warn() { printf '[smoke][WARN] %s\n' "$*" >&2; }
fail() { printf '[smoke][FAIL] %s\n' "$*" >&2; exit 1; }

cleanup() {
  [[ -n "$COOKIE_JAR" && -f "$COOKIE_JAR" ]] && rm -f "$COOKIE_JAR"
  [[ -n "$TMP_DIR" && -d "$TMP_DIR" ]] && rm -rf "$TMP_DIR"
}
trap cleanup EXIT

load_env_file() {
  local file="$1"
  [[ -f "$file" ]] || return 0

  set -a
  # shellcheck disable=SC1090
  source "$file"
  set +a
}

require_cmd() {
  command -v "$1" >/dev/null 2>&1 || fail "缺少命令：$1"
}

http_code() {
  local method="$1"
  local url="$2"
  local output="$3"
  shift 3

  curl --silent --show-error --location --max-time "${CURL_TIMEOUT:-30}" \
    --request "$method" \
    --cookie "$COOKIE_JAR" --cookie-jar "$COOKIE_JAR" \
    --output "$output" \
    --write-out '%{http_code}' \
    "$@" \
    "$url"
}

assert_json_ok() {
  local label="$1"
  local method="$2"
  local path="$3"
  local body="${4:-}"
  local output="$TMP_DIR/${label//[^A-Za-z0-9_.-]/_}.json"
  local code

  if [[ -n "$body" ]]; then
    code="$(http_code "$method" "$BASE_URL$path" "$output" \
      --header 'Content-Type: application/json' \
      --data "$body")"
  else
    code="$(http_code "$method" "$BASE_URL$path" "$output")"
  fi

  [[ "$code" =~ ^2[0-9][0-9]$ ]] || fail "$label 失败：HTTP $code"
  log "$label OK：HTTP $code"
}

check_service_active() {
  local service="$1"

  if ! command -v systemctl >/dev/null 2>&1; then
    warn "systemctl 不可用，跳过服务检查：$service"
    return 0
  fi

  if systemctl is-active --quiet "$service"; then
    log "服务 active：$service"
  else
    fail "服务未 active：$service"
  fi
}

check_login() {
  local output="$TMP_DIR/login.json"
  local code
  local payload

  payload="$(printf '{"identifier":"%s","password":"%s"}' "$TEACHER_LOGIN_IDENTIFIER" "$TEACHER_LOGIN_PASSWORD")"
  code="$(http_code POST "$BASE_URL/api/auth/login" "$output" \
    --header 'Content-Type: application/json' \
    --data "$payload")"

  [[ "$code" =~ ^2[0-9][0-9]$ ]] || fail "教师登录失败：HTTP $code"
  grep -q '"success"[[:space:]]*:[[:space:]]*true' "$output" || fail "教师登录响应未返回 success=true"
  log "教师登录 OK：$TEACHER_LOGIN_IDENTIFIER"
}

check_me() {
  local output="$TMP_DIR/me.json"
  local code

  code="$(http_code GET "$BASE_URL/api/auth/me" "$output")"
  [[ "$code" =~ ^2[0-9][0-9]$ ]] || fail "/api/auth/me 失败：HTTP $code"
  grep -Eq '"role"[[:space:]]*:[[:space:]]*"(teacher|admin)"' "$output" || fail "/api/auth/me 未返回 teacher/admin 用户"
  log "/api/auth/me OK"
}

check_server_providers() {
  local output="$TMP_DIR/server-providers.json"
  local code

  code="$(http_code GET "$BASE_URL/api/openmaic/server-providers" "$output")"
  case "$code" in
    200|201|204)
      log "/api/openmaic/server-providers OK：HTTP $code"
      ;;
    401|403)
      warn "/api/openmaic/server-providers 权限不足，已跳过：HTTP $code"
      ;;
    *)
      fail "/api/openmaic/server-providers 失败：HTTP $code"
      ;;
  esac
}

check_pptx_export() {
  local pptx="$TMP_DIR/smoke.pptx"
  local code
  local mime
  local payload='{"lessonTitle":"OpenMAIC Smoke Test","items":[{"title":"Smoke Slide","itemType":"doc","sourceType":"teacher","duration":60}]}'

  code="$(http_code POST "$BASE_URL/api/teacher/pptx/export" "$pptx" \
    --header 'Content-Type: application/json' \
    --data "$payload")"
  [[ "$code" =~ ^2[0-9][0-9]$ ]] || fail "PPTX 导出失败：HTTP $code"
  [[ -s "$pptx" ]] || fail "PPTX 导出文件为空"

  mime="$(file --brief "$pptx")"
  if [[ "$mime" != *"Microsoft PowerPoint"* && "$mime" != *"Zip archive data"* ]]; then
    fail "PPTX file 类型异常：$mime"
  fi

  unzip -tq "$pptx" >/dev/null || fail "PPTX unzip 校验失败"
  unzip -l "$pptx" '[Content_Types].xml' 'ppt/presentation.xml' >/dev/null || fail "PPTX 缺少必要结构"
  log "PPTX 导出 OK：file/unzip 验证通过"
}

find_miniapp_resource() {
  local root="$1"
  [[ -d "$root" ]] || return 1
  find "$root" -mindepth 3 -maxdepth 3 -type f \( -name 'index.html' -o -name 'manifest.json' \) -print -quit
}

check_miniapps_static() {
  local root="${MINIAPPS_ROOT:-/data/miniapps}"
  local resource
  local relative
  local output="$TMP_DIR/miniapp-static.out"
  local code

  resource="$(find_miniapp_resource "$root" || true)"
  if [[ -z "$resource" ]]; then
    warn "/miniapps 无可检查资源，已跳过：$root"
    return 0
  fi

  relative="${resource#"$root"/}"
  code="$(http_code GET "$BASE_URL/miniapps/$relative" "$output")"
  [[ "$code" =~ ^2[0-9][0-9]$ ]] || fail "/miniapps 静态路径不可达：HTTP $code ($relative)"
  log "/miniapps 静态路径 OK：/$relative"
}

load_env_file "$ENV_FILE"

require_cmd curl
require_cmd file
require_cmd unzip

COOKIE_JAR="$(mktemp)"
TMP_DIR="$(mktemp -d)"

HOSTNAME_VALUE="${HOSTNAME:-127.0.0.1}"
PORT_VALUE="${PORT:-3001}"
BASE_URL="${SMOKE_BASE_URL:-http://$HOSTNAME_VALUE:$PORT_VALUE}"
BASE_URL="${BASE_URL%/}"
TEACHER_LOGIN_IDENTIFIER="${SMOKE_TEACHER_IDENTIFIER:-${TEACHER_LOGIN_IDENTIFIER:-teacher@test.com}}"
TEACHER_LOGIN_PASSWORD="${SMOKE_TEACHER_PASSWORD:-${TEACHER_LOGIN_PASSWORD:-Teacher@2026}}"

log "读取环境：$ENV_FILE"
log "目标地址：$BASE_URL"

for service in ${SMOKE_SERVICES:-course-platform-nextjs openmaic nginx}; do
  check_service_active "$service"
done

check_login
check_me
assert_json_ok "OpenMAIC health" GET "/api/openmaic/health"
check_server_providers
check_pptx_export
check_miniapps_static

log "全部冒烟检查完成"
