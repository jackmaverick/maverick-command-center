#!/usr/bin/env bash
set -euo pipefail

REPO_PATH="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
LOCK_DIR="$REPO_PATH/.production-communication-health-publisher.lock"

if ! mkdir "$LOCK_DIR" 2>/dev/null; then
  echo "Production communication health publisher is already running; skipping overlap."
  exit 0
fi
trap 'rmdir "$LOCK_DIR" 2>/dev/null || true' EXIT

cd "$REPO_PATH"
if [[ ! -f .env.local ]]; then
  echo "Missing .env.local with DATABASE_URL."
  exit 1
fi
set -a
# shellcheck disable=SC1091
source .env.local
set +a

NODE_BIN="${NODE_BIN:-/Users/maverick_ai/.local/bin/node}"
if [[ ! -x "$NODE_BIN" ]]; then
  echo "Node runtime not found at $NODE_BIN."
  exit 1
fi
"$NODE_BIN" scripts/publish-production-communication-health.mjs
