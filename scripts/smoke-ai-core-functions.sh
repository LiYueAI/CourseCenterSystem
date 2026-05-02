#!/usr/bin/env bash
set -Eeuo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ENV_FILE="${ENV_FILE:-$ROOT_DIR/nextjs/.env.host}"
COOKIE_JAR=""
TMP_DIR=""

log() { printf '[ai-core-smoke] %s\n' "$*"; }
fail() { printf '[ai-core-smoke][FAIL] %s\n' "$*" >&2; exit 1; }
cleanup() { [[ -n "$COOKIE_JAR" && -f "$COOKIE_JAR" ]] && rm -f "$COOKIE_JAR"; [[ -n "$TMP_DIR" && -d "$TMP_DIR" ]] && rm -rf "$TMP_DIR"; }
trap cleanup EXIT

[[ -f "$ENV_FILE" ]] && { set -a; source "$ENV_FILE"; set +a; }
command -v curl >/dev/null 2>&1 || fail '缺少 curl'
COOKIE_JAR="$(mktemp)"
TMP_DIR="$(mktemp -d)"
BASE_URL="${SMOKE_BASE_URL:-http://${HOSTNAME:-127.0.0.1}:${PORT:-3001}}"
BASE_URL="${BASE_URL%/}"
TEACHER_LOGIN_IDENTIFIER="${SMOKE_TEACHER_IDENTIFIER:-teacher@test.com}"
TEACHER_LOGIN_PASSWORD="${SMOKE_TEACHER_PASSWORD:-Teacher@2026}"

post_json() {
  local check_name="$1"
  local path="$2"
  local body="$3"
  local out="$TMP_DIR/$check_name.json"
  local code
  code="$(curl -sS -b "$COOKIE_JAR" -o "$out" -w '%{http_code}' -H 'Content-Type: application/json' -d "$body" "$BASE_URL$path")"
  [[ "$code" =~ ^2[0-9][0-9]$ ]] || { cat "$out" >&2; fail "$check_name HTTP $code"; }
  log "$check_name OK：HTTP $code"
  cat "$out" > "$TMP_DIR/$check_name.last"
}

login_out="$TMP_DIR/login.json"
login_code="$(curl -sS -c "$COOKIE_JAR" -o "$login_out" -w '%{http_code}' -H 'Content-Type: application/json' -d "{\"identifier\":\"$TEACHER_LOGIN_IDENTIFIER\",\"password\":\"$TEACHER_LOGIN_PASSWORD\"}" "$BASE_URL/api/auth/login")"
[[ "$login_code" =~ ^2[0-9][0-9]$ ]] || fail "教师登录失败：HTTP $login_code"
grep -q '"success"[[:space:]]*:[[:space:]]*true' "$login_out" || fail '教师登录未返回 success=true'
log "教师登录 OK：$TEACHER_LOGIN_IDENTIFIER"

post_json chat /api/openmaic/chat '{"messages":[{"role":"user","content":"用一句话说明荷花教学重点"}],"agents":[{"id":"default-2","name":"课程创作助手"}],"turnCount":0}'
grep -q '"success"[[:space:]]*:[[:space:]]*true' "$TMP_DIR/chat.last" || fail '课程创作助手未返回 success=true'

post_json ai_generate /api/ai/generate '{"prompt":"请生成一句小学语文课堂导入语","type":"text"}'
grep -q '"configured"[[:space:]]*:[[:space:]]*true' "$TMP_DIR/ai_generate.last" || fail '平台通用 AI 未配置或未返回 configured=true'

post_json scene_outlines /api/openmaic/scene-outlines '{"requirement":"小学语文荷花，生成2个教学场景","interactiveMode":true}'
grep -q '"success"[[:space:]]*:[[:space:]]*true' "$TMP_DIR/scene_outlines.last" || fail '场景大纲未返回 success=true'

log 'AI 核心功能 smoke 完成'
