#!/usr/bin/env bash
set -Eeuo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

run_if_exists() {
  local script="$1"
  if [[ -x "$script" ]]; then
    printf '\n[stage5] RUN %s\n' "$script"
    "$script"
  elif [[ -f "$script" ]]; then
    printf '\n[stage5] RUN bash %s\n' "$script"
    bash "$script"
  else
    printf '\n[stage5][SKIP] %s not found\n' "$script"
  fi
}

run_if_exists "$ROOT_DIR/scripts/smoke-openmaic-course-platform.sh"
run_if_exists "$ROOT_DIR/scripts/smoke-permission-boundary.sh"
run_if_exists "$ROOT_DIR/scripts/smoke-openmaic-generation-start.sh"
run_if_exists "$ROOT_DIR/scripts/smoke-ai-core-functions.sh"
run_if_exists "$ROOT_DIR/scripts/ops-failure-mode-check.sh"

printf '\n[stage5] Stage 5 checks finished.\n'
