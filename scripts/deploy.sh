#!/usr/bin/env bash
# Rebuild Split-Up and restart the production service (splitup.service).
# Usage: npm run deploy   (or: bash scripts/deploy.sh)
set -euo pipefail
cd "$(dirname "$0")/.."

SERVICE=splitup
SOCKET=$(grep -E '^SOCKET_PATH=' .env | cut -d= -f2- || true)

echo "==> Installing dependencies"
npm install --no-audit --no-fund

echo "==> Checking"
npm test
npm run typecheck

# Build into side directories first, so the live site keeps its assets until the swap.
echo "==> Building"
(cd apps/web && npx vite build --outDir dist.new --emptyOutDir)
(cd apps/api && npx esbuild src/index.ts --bundle --platform=node --target=node20 --format=cjs --outfile=dist/index.cjs.new --log-level=warning)

echo "==> Swapping in the new build and restarting $SERVICE"
rm -rf apps/web/dist.old
[ -d apps/web/dist ] && mv apps/web/dist apps/web/dist.old
mv apps/web/dist.new apps/web/dist
mv apps/api/dist/index.cjs.new apps/api/dist/index.cjs
systemctl restart "$SERVICE"

echo "==> Waiting for the app to answer"
for _ in $(seq 1 30); do
  if { [ -n "$SOCKET" ] && curl -sf --unix-socket "$SOCKET" http://localhost/api/config >/dev/null; } \
    || { [ -z "$SOCKET" ] && curl -sf http://localhost:3000/api/config >/dev/null; }; then
    rm -rf apps/web/dist.old
    echo "==> Deployed ✓  $(git rev-parse --short HEAD)$(git diff --quiet || echo ' + uncommitted changes')"
    exit 0
  fi
  sleep 1
done

echo "!! $SERVICE didn't come up. Last log lines:" >&2
journalctl -u "$SERVICE" -n 30 --no-pager >&2
echo "!! The previous web build is in apps/web/dist.old" >&2
exit 1
