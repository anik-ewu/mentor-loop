#!/usr/bin/env bash
# PostToolUse hook (Edit|Write|MultiEdit): format the edited file with Prettier, then ESLint --fix it.
# Lint errors that can't be auto-fixed go to stderr with exit 2, so Claude sees and fixes them.
set -uo pipefail

command -v jq >/dev/null || exit 0
file=$(jq -r '.tool_input.file_path // empty')
[ -z "$file" ] || [ ! -f "$file" ] && exit 0

root="${CLAUDE_PROJECT_DIR:-$(pwd)}"
case "$file" in
  "$root"/*) ;;
  *) exit 0 ;; # outside the project
esac
case "$file" in
  */node_modules/* | */dist/* | */prisma/migrations/*) exit 0 ;;
esac

bin="$root/node_modules/.bin"
cd "$root" || exit 0
[ -x "$bin/prettier" ] && [ -x "$bin/eslint" ] || exit 0 # deps not installed yet

case "$file" in
  *.ts | *.tsx | *.js | *.jsx | *.mjs | *.cjs | *.css | *.json | *.md | *.yml | *.yaml | *.html)
    "$bin/prettier" --write --ignore-unknown --log-level warn "$file" >/dev/null 2>&1
    ;;
esac

case "$file" in
  *.ts | *.tsx | *.js | *.jsx | *.mjs | *.cjs)
    if ! out=$("$bin/eslint" --fix --no-warn-ignored "$file" 2>&1); then
      echo "ESLint found problems it couldn't fix in $file:" >&2
      echo "$out" >&2
      exit 2
    fi
    ;;
esac
exit 0
