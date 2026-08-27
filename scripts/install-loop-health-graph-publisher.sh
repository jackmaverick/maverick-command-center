#!/usr/bin/env bash
set -euo pipefail

REPO_PATH="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
LABEL="com.maverick.loop-health-graph-publisher"
TEMPLATE="$REPO_PATH/scripts/$LABEL.plist.template"
TARGET="$HOME/Library/LaunchAgents/$LABEL.plist"
RUNNER="$REPO_PATH/scripts/run-loop-health-graph-publisher.sh"
LOG_DIR="$HOME/maverick-local-automations/logs"

mkdir -p "$LOG_DIR"
chmod +x "$RUNNER"

sed \
  -e "s|__REPO_PATH__|$REPO_PATH|g" \
  -e "s|__RUNNER_PATH__|$RUNNER|g" \
  "$TEMPLATE" > "$TARGET"

launchctl bootout "gui/$(id -u)/$LABEL" 2>/dev/null || true
launchctl bootstrap "gui/$(id -u)" "$TARGET"
launchctl kickstart -k "gui/$(id -u)/$LABEL"

echo "Installed $LABEL from $REPO_PATH"
