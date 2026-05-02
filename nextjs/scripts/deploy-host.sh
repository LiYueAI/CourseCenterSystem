#!/usr/bin/env bash
set -euo pipefail

APP_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$APP_DIR"

npm run build

mkdir -p .next/standalone/.next
rm -rf .next/standalone/.next/static
cp -a .next/static .next/standalone/.next/static

rm -rf .next/standalone/public
cp -a public .next/standalone/public

sudo systemctl restart course-platform-nextjs

for attempt in {1..20}; do
  homepage_status="$(curl -sS -o /dev/null -w '%{http_code}' http://127.0.0.1/ || true)"
  if [[ "$homepage_status" == "200" || "$homepage_status" == "307" || "$homepage_status" == "308" ]]; then
    break
  fi
  sleep 0.5
done

css_file="$(find .next/static/css -maxdepth 1 -type f -name '*.css' | head -n 1)"
if [[ -n "${css_file:-}" ]]; then
  css_path="/_next/static/css/$(basename "$css_file")"
  status="000"
  for attempt in {1..20}; do
    status="$(curl -sS -o /dev/null -w '%{http_code}' "http://127.0.0.1${css_path}" || true)"
    [[ "$status" == "200" ]] && break
    sleep 0.5
  done
  if [[ "$status" != "200" ]]; then
    echo "Static CSS check failed: ${css_path} returned ${status}" >&2
    exit 1
  fi
  echo "Static CSS check passed: ${css_path}"
fi

curl -sS -o /dev/null -w 'Homepage check: %{http_code}\n' http://127.0.0.1/
