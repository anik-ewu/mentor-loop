#!/usr/bin/env bash
# PreToolUse hook (Bash): any `git push` that may update main needs the user's OK, even in bypass mode.
# Pushing to main redeploys production; normal work goes to dev (see CLAUDE.md).
# Over-matching on purpose: an extra prompt is harmless, a missed main push is not.
set -uo pipefail

command -v jq >/dev/null || { echo "guard-main: jq is missing, so main pushes can't be checked" >&2; exit 2; }

cmd=$(jq -r '.tool_input.command // empty')
branch=$(git -C "${CLAUDE_PROJECT_DIR:-.}" branch --show-current 2>/dev/null)

ask=false
# Check each shell segment on its own, so `git push origin dev && git checkout main` doesn't prompt.
while IFS= read -r seg; do
  echo "$seg" | grep -Eq '(^|[[:space:]])git([[:space:]]|$)' || continue
  echo "$seg" | grep -Eq '[[:space:]]push([[:space:]]|$)' || continue
  args=$(echo "$seg" | sed -E 's/.*[[:space:]]push([[:space:]]|$)//')
  if echo "$args" | grep -Eq "(^|[[:space:]:+/\"'])main([[:space:]\"']|$)|--all|--mirror" ||
    [ "$branch" = "main" ]; then
    ask=true
  fi
done < <(echo "$cmd" | tr ';&|()\n' '\n\n\n\n\n\n')

if $ask; then
  jq -n '{hookSpecificOutput: {
    hookEventName: "PreToolUse",
    permissionDecision: "ask",
    permissionDecisionReason: "This push may update main, which redeploys production. Normal work goes to dev; merge to main only after the user says yes."
  }}'
fi
exit 0
