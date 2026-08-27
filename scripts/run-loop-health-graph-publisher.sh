#!/usr/bin/env bash
set -euo pipefail

REPO_PATH="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
LOCK_DIR="$REPO_PATH/.loop-health-graph-publisher.lock"
ENV_FILE="${LOOP_HEALTH_ENV_FILE:-/Users/maverick_ai/maverick-command-center/.env.production.local}"

if ! mkdir "$LOCK_DIR" 2>/dev/null; then
  echo "Loop health graph publisher is already running; skipping overlap."
  exit 0
fi
trap 'rmdir "$LOCK_DIR" 2>/dev/null || true' EXIT

if [[ ! -f "$ENV_FILE" ]]; then
  echo "Missing loop health environment file: $ENV_FILE"
  exit 1
fi

cd "$REPO_PATH"
set -a
# shellcheck disable=SC1090
source "$ENV_FILE"
set +a

# launchd supplies only the system PATH. tsx uses `#!/usr/bin/env node`, so add
# the standard Homebrew locations before invoking it.
USER_HOME="${HOME:-/Users/maverick_ai}"
export PATH="$USER_HOME/.local/bin:$USER_HOME/.hermes/node/bin:/opt/homebrew/bin:/usr/local/bin:$PATH"
if ! command -v node >/dev/null 2>&1; then
  echo "Node.js is unavailable to the loop health publisher."
  exit 1
fi

TSX_BIN="$REPO_PATH/node_modules/.bin/tsx"
if [[ ! -x "$TSX_BIN" ]]; then
  echo "tsx runtime is missing. Run npm ci in $REPO_PATH."
  exit 1
fi

"$TSX_BIN" scripts/collect-and-publish-loop-health.ts
