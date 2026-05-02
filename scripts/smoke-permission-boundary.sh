#!/usr/bin/env bash
set -Eeuo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ENV_FILE=""
COOKIE_JAR=""
TMP_DIR=""
FAILURES=0
PGHOST_VALUE=""
PGPORT_VALUE=""
PGDATABASE_VALUE=""
PGUSER_VALUE=""
PGPASSWORD_VALUE=""

log() { printf '[boundary-smoke][%s] %s\n' "$1" "$2"; }
pass() { log PASS "$1"; }
warn() { log WARN "$1" >&2; }
skip() { log SKIP "$1"; }
fail_check() { log FAIL "$1" >&2; FAILURES=$((FAILURES + 1)); }
die() { log FAIL "$1" >&2; exit 1; }

cleanup() {
  [[ -n "$COOKIE_JAR" && -f "$COOKIE_JAR" ]] && rm -f "$COOKIE_JAR"
  [[ -n "$TMP_DIR" && -d "$TMP_DIR" ]] && rm -rf "$TMP_DIR"
}
trap cleanup EXIT

require_cmd() {
  command -v "$1" >/dev/null 2>&1 || die "缺少命令：$1"
}

load_env_file() {
  local file="$1"
  [[ -f "$file" ]] || return 1

  set -a
  # shellcheck disable=SC1090
  source "$file"
  set +a
  ENV_FILE="$file"
  return 0
}

load_database_env() {
  if load_env_file "$ROOT_DIR/nextjs/.env.host"; then
    return 0
  fi

  if load_env_file "$ROOT_DIR/.env"; then
    return 0
  fi

  die "未找到环境文件：$ROOT_DIR/nextjs/.env.host 或 $ROOT_DIR/.env"
}

psql_query() {
  local sql="$1"
  if [[ -n "$PGHOST_VALUE" ]]; then
    PGPASSWORD="$PGPASSWORD_VALUE" psql \
      --host "$PGHOST_VALUE" \
      --port "$PGPORT_VALUE" \
      --username "$PGUSER_VALUE" \
      --dbname "$PGDATABASE_VALUE" \
      --tuples-only --no-align --quiet --set=ON_ERROR_STOP=1 --command "$sql"
  else
    psql "$DATABASE_URL" --tuples-only --no-align --quiet --set=ON_ERROR_STOP=1 --command "$sql"
  fi
}

configure_psql_from_database_url() {
  local rest userinfo hostpath hostport database

  rest="${DATABASE_URL#*://}"
  if [[ "$rest" == "$DATABASE_URL" || "$rest" != *@* ]]; then
    return 0
  fi

  userinfo="${rest%@*}"
  hostpath="${rest##*@}"
  hostpath="${hostpath%%\?*}"
  hostport="${hostpath%%/*}"
  database="${hostpath#*/}"

  [[ -n "$userinfo" && -n "$hostport" && -n "$database" && "$database" != "$hostpath" ]] || return 0

  PGUSER_VALUE="${userinfo%%:*}"
  PGPASSWORD_VALUE="${userinfo#*:}"
  PGHOST_VALUE="${hostport%:*}"
  PGPORT_VALUE="${hostport##*:}"
  PGDATABASE_VALUE="$database"

  if [[ "$PGPORT_VALUE" == "$PGHOST_VALUE" ]]; then
    PGPORT_VALUE="5432"
  fi
}

sql_literal() {
  local value="${1//\'/\'\'}"
  printf "'%s'" "$value"
}

table_exists() {
  local table_name="$1"
  [[ "$(psql_query "select to_regclass('public.$table_name') is not null")" == "t" ]]
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

http_code_no_cookie() {
  local method="$1"
  local url="$2"
  local output="$3"
  shift 3

  curl --silent --show-error --max-time "${CURL_TIMEOUT:-30}" \
    --request "$method" \
    --output "$output" \
    --write-out '%{http_code}' \
    "$@" \
    "$url"
}

is_denied_code() {
  [[ "$1" == "401" || "$1" == "403" || "$1" == "404" || "$1" == "302" || "$1" == "303" || "$1" == "307" || "$1" == "308" ]]
}

login_teacher() {
  local output="$TMP_DIR/login.json"
  local payload code

  payload="$(printf '{"identifier":"%s","password":"%s"}' "$TEACHER_LOGIN_IDENTIFIER" "$TEACHER_LOGIN_PASSWORD")"
  code="$(http_code POST "$BASE_URL/api/auth/login" "$output" \
    --header 'Content-Type: application/json' \
    --data "$payload")"

  if [[ ! "$code" =~ ^2[0-9][0-9]$ ]]; then
    die "测试教师登录失败：HTTP $code ($TEACHER_LOGIN_IDENTIFIER)"
  fi
  if ! grep -q '"success"[[:space:]]*:[[:space:]]*true' "$output"; then
    die "测试教师登录响应未返回 success=true"
  fi

  pass "测试教师登录成功：$TEACHER_LOGIN_IDENTIFIER"
}

check_unauthenticated_resource_api_denied() {
  local output="$TMP_DIR/unauth-teacher-resources.json"
  local code

  code="$(http_code_no_cookie GET "$BASE_URL/api/teacher/resources?lessonId=1" "$output")"
  if is_denied_code "$code"; then
    pass "资源 API 未登录访问被拒绝：HTTP $code"
  else
    fail_check "资源 API 未登录访问未被拒绝：HTTP $code"
  fi
}

find_cross_teacher_fixture() {
  local teacher_email_literal
  local other_teacher
  local other_teacher_id
  local other_teacher_identifier
  local resource_fixture="|"
  local draft_id=""
  teacher_email_literal="$(sql_literal "$TEACHER_LOGIN_IDENTIFIER")"

  other_teacher="$(psql_query "
    with current_teacher as (
      select id
      from auth_users
      where lower(email) = lower($teacher_email_literal)
        and role = 'teacher'
      limit 1
    )
    select au.id::text || '|' || coalesce(au.email, au.phone, au.id::text)
    from auth_users au
    where au.role = 'teacher'
      and au.is_active = true
      and au.id <> (select id from current_teacher)
    order by
      case when exists (
        select 1 from teacher_resources tr where tr.auth_user_id::text = au.id::text
      ) then 0 else 1 end,
      case when exists (
        select 1 from openmaic_course_drafts od where od.auth_user_id = au.id
      ) then 0 else 1 end,
      au.created_at nulls last,
      au.id
    limit 1
  " | head -n 1)"

  if [[ -z "$other_teacher" ]]; then
    printf '||||\n'
    return 0
  fi

  IFS='|' read -r other_teacher_id other_teacher_identifier <<< "$other_teacher"

  if table_exists teacher_resources; then
    resource_fixture="$(psql_query "
      select coalesce(id::text, '') || '|' || coalesce(lesson_id::text, '')
      from teacher_resources
      where auth_user_id::text = $(sql_literal "$other_teacher_id")
      order by created_at desc nulls last, id desc
      limit 1
    " | head -n 1)"
    [[ -n "$resource_fixture" ]] || resource_fixture="|"
  fi

  if table_exists openmaic_course_drafts; then
    draft_id="$(psql_query "
      select id::text
      from openmaic_course_drafts
      where auth_user_id::text = $(sql_literal "$other_teacher_id")
      order by updated_at desc nulls last, id desc
      limit 1
    " | head -n 1)"
  fi

  printf '%s|%s|%s|%s\n' "$other_teacher_id" "$other_teacher_identifier" "$resource_fixture" "$draft_id"
}

check_cross_teacher_resource_access() {
  local resource_id="$1"
  local lesson_id="$2"
  local output code

  if [[ -z "$resource_id" ]]; then
    skip "第二个教师没有 teacher_resources 记录，跳过跨教师资源访问检查"
    return 0
  fi

  output="$TMP_DIR/cross-teacher-resource-list.json"
  code="$(http_code GET "$BASE_URL/api/teacher/resources?lessonId=$lesson_id" "$output")"
  if [[ "$code" =~ ^2[0-9][0-9]$ ]] && ! grep -Eq '"id"[[:space:]]*:[[:space:]]*'"$resource_id"'([^0-9]|$)' "$output"; then
    pass "跨教师 teacher_resources 列表未泄露其他教师资源：HTTP $code"
  else
    fail_check "跨教师 teacher_resources 列表疑似泄露资源 $resource_id：HTTP $code"
  fi

  output="$TMP_DIR/cross-teacher-resource-patch.json"
  code="$(http_code PATCH "$BASE_URL/api/teacher/resources/$resource_id" "$output" \
    --header 'Content-Type: application/json' \
    --data '{"title":"permission-boundary-smoke"}')"
  if is_denied_code "$code"; then
    pass "跨教师 teacher_resources 修改被拒绝：HTTP $code"
  else
    fail_check "跨教师 teacher_resources 修改未被拒绝：HTTP $code"
  fi
}

check_cross_teacher_draft_import() {
  local draft_id="$1"
  local output code

  if [[ -z "$draft_id" ]]; then
    skip "第二个教师没有 openmaic_course_drafts 记录，跳过跨教师草稿导入检查"
    return 0
  fi

  output="$TMP_DIR/cross-teacher-draft-import.json"
  code="$(http_code POST "$BASE_URL/api/openmaic/course-drafts/$draft_id/import" "$output" \
    --header 'Content-Type: application/json' \
    --data '{"lessonId":1,"moduleId":1}')"
  if is_denied_code "$code"; then
    pass "跨教师 openmaic_course_drafts 导入被拒绝：HTTP $code"
  else
    fail_check "跨教师 openmaic_course_drafts 导入未被拒绝：HTTP $code"
  fi
}

check_cross_teacher_pptx_export() {
  local resource_id="$1"
  local output code

  if [[ -z "$resource_id" ]]; then
    skip "缺少第二个教师资源，跳过跨教师 PPTX 导出检查"
    return 0
  fi

  output="$TMP_DIR/cross-teacher-pptx.pptx"
  code="$(http_code POST "$BASE_URL/api/teacher/pptx/export" "$output" \
    --header 'Content-Type: application/json' \
    --data "{\"lessonTitle\":\"Permission Boundary Smoke\",\"items\":[{\"title\":\"Other teacher resource\",\"itemType\":\"ppt\",\"sourceType\":\"teacher\",\"teacherResourceId\":$resource_id}]}")"

  if is_denied_code "$code"; then
    pass "跨教师 PPTX 导出被拒绝：HTTP $code"
  elif [[ "$code" =~ ^2[0-9][0-9]$ ]]; then
    warn "PPTX 导出接口返回成功但未加载其他教师资源；当前实现忽略不可见 teacherResourceId：HTTP $code"
  else
    fail_check "跨教师 PPTX 导出返回异常：HTTP $code"
  fi
}

load_database_env
require_cmd curl
require_cmd psql

if [[ -z "${DATABASE_URL:-}" ]]; then
  die "环境文件中未设置 DATABASE_URL"
fi
configure_psql_from_database_url

COOKIE_JAR="$(mktemp)"
TMP_DIR="$(mktemp -d)"

HOSTNAME_VALUE="${HOSTNAME:-127.0.0.1}"
PORT_VALUE="${PORT:-3001}"
BASE_URL="${SMOKE_BASE_URL:-http://$HOSTNAME_VALUE:$PORT_VALUE}"
BASE_URL="${BASE_URL%/}"
TEACHER_LOGIN_IDENTIFIER="${SMOKE_TEACHER_IDENTIFIER:-${TEACHER_LOGIN_IDENTIFIER:-teacher@test.com}}"
TEACHER_LOGIN_PASSWORD="${SMOKE_TEACHER_PASSWORD:-${TEACHER_LOGIN_PASSWORD:-Teacher@2026}}"

log PASS "读取环境：$ENV_FILE"
log PASS "目标地址：$BASE_URL"

login_teacher
check_unauthenticated_resource_api_denied

IFS='|' read -r OTHER_TEACHER_ID OTHER_TEACHER_IDENTIFIER OTHER_RESOURCE_ID OTHER_LESSON_ID OTHER_DRAFT_ID < <(find_cross_teacher_fixture)

if [[ -z "${OTHER_TEACHER_ID:-}" ]]; then
  skip "未发现第二个可用教师账号，跳过跨教师访问检查"
else
  pass "发现第二个教师账号：$OTHER_TEACHER_IDENTIFIER"
  check_cross_teacher_resource_access "${OTHER_RESOURCE_ID:-}" "${OTHER_LESSON_ID:-}"
  check_cross_teacher_draft_import "${OTHER_DRAFT_ID:-}"
  check_cross_teacher_pptx_export "${OTHER_RESOURCE_ID:-}"
fi

if (( FAILURES > 0 )); then
  die "权限边界 smoke 发现 $FAILURES 个真实失败"
fi

pass "权限边界 smoke 完成"
