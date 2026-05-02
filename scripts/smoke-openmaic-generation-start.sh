#!/usr/bin/env bash
set -Eeuo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ENV_FILE="${ENV_FILE:-$ROOT_DIR/nextjs/.env.host}"
COOKIE_JAR=""
TMP_DIR=""

log() { printf '[openmaic-generation-smoke] %s\n' "$*"; }
fail() { printf '[openmaic-generation-smoke][FAIL] %s\n' "$*" >&2; exit 1; }
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

login_out="$TMP_DIR/login.json"
login_code="$(curl -sS -c "$COOKIE_JAR" -o "$login_out" -w '%{http_code}' -H 'Content-Type: application/json' -d "{\"identifier\":\"$TEACHER_LOGIN_IDENTIFIER\",\"password\":\"$TEACHER_LOGIN_PASSWORD\"}" "$BASE_URL/api/auth/login")"
[[ "$login_code" =~ ^2[0-9][0-9]$ ]] || fail "教师登录失败：HTTP $login_code"
grep -q '"success"[[:space:]]*:[[:space:]]*true' "$login_out" || fail '教师登录未返回 success=true'
log "教师登录 OK：$TEACHER_LOGIN_IDENTIFIER"

gen_out="$TMP_DIR/generate.json"
gen_code="$(curl -sS -b "$COOKIE_JAR" -o "$gen_out" -w '%{http_code}' -H 'Content-Type: application/json' -d '{"requirement":"OpenMAIC 生成启动烟测：生成2页小学语文课件，包含导入和课堂小游戏。","enableWebSearch":false,"enableImageGeneration":false}' "$BASE_URL/api/openmaic/classroom/generate")"
[[ "$gen_code" =~ ^2[0-9][0-9]$ ]] || { cat "$gen_out" >&2; fail "OpenMAIC 生成启动失败：HTTP $gen_code"; }
grep -q '"success"[[:space:]]*:[[:space:]]*true' "$gen_out" || { cat "$gen_out" >&2; fail 'OpenMAIC 生成启动未返回 success=true'; }
grep -q '"jobId"' "$gen_out" || { cat "$gen_out" >&2; fail 'OpenMAIC 生成启动未返回 jobId'; }
log "OpenMAIC 生成启动 OK：$(tr -d '\n' < "$gen_out")"
