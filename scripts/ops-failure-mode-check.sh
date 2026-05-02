#!/usr/bin/env bash
set -Eeuo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ENV_FILE="${ENV_FILE:-$ROOT_DIR/nextjs/.env.host}"
CORE_FAILED=0
WARNED=0

PASS_COUNT=0
WARN_COUNT=0
FAIL_COUNT=0

CORE_SERVICES=(course-platform-nextjs openmaic nginx postgresql@16-main redis-server directus)
REQUIRED_OPENMAIC_VARS=(
  OPENMAIC_BASE_URL
  OPENMAIC_ACCESS_CODE
  OPENAI_BASE_URL
  OPENAI_MODELS
  DEFAULT_MODEL
  OPENAI_API_KEY
  OPENMAIC_IMAGE_PROVIDER
  OPENMAIC_IMAGE_API_KEY
  OPENMAIC_IMAGE_BASE_URL
  OPENMAIC_IMAGE_MODEL
  OPENMAIC_VIDEO_PROVIDER
  OPENMAIC_VIDEO_API_KEY
  OPENMAIC_VIDEO_BASE_URL
  OPENMAIC_VIDEO_MODEL
)

pass() {
  PASS_COUNT=$((PASS_COUNT + 1))
  printf '[PASS] %s\n' "$*"
}

warn() {
  WARN_COUNT=$((WARN_COUNT + 1))
  WARNED=1
  printf '[WARN] %s\n' "$*"
}

fail_core() {
  FAIL_COUNT=$((FAIL_COUNT + 1))
  CORE_FAILED=1
  printf '[FAIL] %s\n' "$*"
}

load_env_file() {
  local file="$1"
  if [[ ! -f "$file" ]]; then
    warn "环境文件不存在，跳过变量文件加载：$file"
    return 0
  fi

  set -a
  # shellcheck disable=SC1090
  source "$file"
  set +a
  pass "已加载环境文件：$file"
}

require_cmd() {
  command -v "$1" >/dev/null 2>&1
}

check_service() {
  local service="$1"

  if ! require_cmd systemctl; then
    fail_core "systemctl 不可用，无法检查核心服务：$service"
    return 0
  fi

  if systemctl is-active --quiet "$service"; then
    pass "systemd 服务 active：$service"
  else
    fail_core "systemd 服务未 active：$service"
  fi
}

check_tcp() {
  local label="$1"
  local host="$2"
  local port="$3"
  local severity="${4:-core}"

  if timeout 3 bash -c "</dev/tcp/$host/$port" >/dev/null 2>&1; then
    pass "$label TCP 可达：$host:$port"
  elif [[ "$severity" == "warn" ]]; then
    warn "$label TCP 不可达：$host:$port"
  else
    fail_core "$label TCP 不可达：$host:$port"
  fi
}

check_http() {
  local label="$1"
  local url="$2"
  local severity="${3:-core}"
  local code

  if ! require_cmd curl; then
    if [[ "$severity" == "warn" ]]; then
      warn "缺少 curl，跳过非核心 HTTP 检查：$label"
    else
      fail_core "缺少 curl，无法检查核心 HTTP：$label"
    fi
    return 0
  fi

  code="$(curl --silent --show-error --location --max-time 5 --output /dev/null --write-out '%{http_code}' "$url" 2>/dev/null || true)"
  if [[ "$code" =~ ^[23][0-9][0-9]$ ]]; then
    pass "$label HTTP 可达：$url ($code)"
  elif [[ "$severity" == "warn" ]]; then
    warn "$label HTTP 不可达：$url (${code:-curl failed})"
  else
    fail_core "$label HTTP 不可达：$url (${code:-curl failed})"
  fi
}

check_disk() {
  local path="${DISK_CHECK_PATH:-$ROOT_DIR}"
  local min_free_mb="${MIN_FREE_MB:-1024}"
  local free_kb
  local free_mb

  if [[ ! -e "$path" ]]; then
    fail_core "磁盘检查路径不存在：$path"
    return 0
  fi

  free_kb="$(df -Pk "$path" | awk 'NR==2 {print $4}')"
  free_mb=$((free_kb / 1024))
  if (( free_mb >= min_free_mb )); then
    pass "磁盘剩余空间充足：${free_mb}MB >= ${min_free_mb}MB ($path)"
  else
    fail_core "磁盘剩余空间不足：${free_mb}MB < ${min_free_mb}MB ($path)"
  fi
}

check_miniapps_root() {
  local root="${MINIAPPS_ROOT:-/data/miniapps}"

  if [[ ! -d "$root" ]]; then
    fail_core "miniapps 根目录不存在：$root"
    return 0
  fi

  if [[ ! -r "$root" ]]; then
    fail_core "miniapps 根目录不可读：$root"
    return 0
  fi

  if [[ ! -w "$root" ]]; then
    warn "miniapps 根目录当前用户不可写：$root"
  else
    pass "miniapps 根目录可读写：$root"
  fi
}

check_openmaic_env() {
  local missing=()
  local empty=()
  local var

  for var in "${REQUIRED_OPENMAIC_VARS[@]}"; do
    if [[ ! ${!var+x} ]]; then
      missing+=("$var")
    elif [[ -z "${!var}" ]]; then
      empty+=("$var")
    fi
  done

  if (( ${#missing[@]} == 0 && ${#empty[@]} == 0 )); then
    pass "OpenMAIC 环境变量完整：${#REQUIRED_OPENMAIC_VARS[@]} 项（未输出密钥）"
    return 0
  fi

  if (( ${#missing[@]} > 0 )); then
    fail_core "OpenMAIC 环境变量缺失：${missing[*]}"
  fi
  if (( ${#empty[@]} > 0 )); then
    fail_core "OpenMAIC 环境变量为空：${empty[*]}"
  fi
}

print_summary() {
  printf 'Summary: PASS=%d WARN=%d FAIL=%d\n' "$PASS_COUNT" "$WARN_COUNT" "$FAIL_COUNT"
}

load_env_file "$ENV_FILE"

for service in "${CORE_SERVICES[@]}"; do
  check_service "$service"
done

check_tcp "Nginx/80" 127.0.0.1 80 core
check_http "Nginx/80" "${CHECK_PUBLIC_URL:-http://127.0.0.1/}" core
check_tcp "内部 Next.js" 127.0.0.1 "${NEXTJS_PORT:-${PORT:-3001}}" core
check_http "内部 Next.js" "${NEXTJS_URL:-http://127.0.0.1:${NEXTJS_PORT:-${PORT:-3001}}/}" core
check_tcp "内部 OpenMAIC" 127.0.0.1 "${OPENMAIC_PORT:-3000}" core
check_http "内部 OpenMAIC" "${OPENMAIC_BASE_URL:-http://127.0.0.1:3000}" core

check_disk
check_miniapps_root
check_openmaic_env

print_summary

if (( CORE_FAILED != 0 )); then
  exit 1
fi

if (( WARNED != 0 )); then
  exit 0
fi

exit 0
