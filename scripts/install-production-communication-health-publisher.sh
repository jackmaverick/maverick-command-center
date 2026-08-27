#!/usr/bin/env bash
set -euo pipefail

REPO_PATH="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
TEMPLATE="$REPO_PATH/scripts/com.maverick.production-communication-health-publisher.plist.template"
TARGET="$HOME/Library/LaunchAgents/com.maverick.production-communication-health-publisher.plist"

if [[ ! -f "$REPO_PATH/.env.local" ]]; then
  echo "Missing $REPO_PATH/.env.local. Pull the Command Center production environment first."
  exit 1
fi

escape_sed() { printf '%s' "$1" | sed 's/[&|\\]/\\&/g'; }
mkdir -p "$HOME/Library/LaunchAgents" "$HOME/maverick-local-automations/logs"
sed -e "s|{{REPO_PATH}}|$(escape_sed "$REPO_PATH")|g" "$TEMPLATE" > "$TARGET"
chmod +x "$REPO_PATH/scripts/run-production-communication-health-publisher.sh"
launchctl unload "$TARGET" 2>/dev/null || true
launchctl load "$TARGET"
echo "Installed $TARGET"
