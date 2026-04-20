#!/usr/bin/env bash
# test-drift.sh — Verify that skills/codecity/ (the committed build output) is
# in sync with src/. Runs `npm run build` and fails if anything under
# skills/codecity/ changed as a result — that means someone edited the shipped
# copy by hand, or forgot to commit a fresh build.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"

(cd "$REPO_ROOT" && npm run build --silent)

if git -C "$REPO_ROOT" diff --exit-code -- skills/codecity >/dev/null 2>&1; then
  echo "  ✓ skills/codecity/ matches src/ — no drift"
  exit 0
fi

echo "  ✗ skills/codecity/ has uncommitted changes after 'npm run build'."
echo "    Source of truth is src/. Don't hand-edit skills/codecity/."
echo "    Run 'npm run build' and commit the updated skills/codecity/."
git -C "$REPO_ROOT" diff --stat -- skills/codecity
exit 1
