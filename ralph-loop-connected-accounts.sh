#!/bin/bash
set -e

if [ -z "$1" ]; then
  echo "Usage: $0 <iterations>"
  exit 1
fi

# jq filter to extract streaming text from assistant messages
stream_text='select(.type == "assistant").message.content[]? | select(.type == "text").text // empty | gsub("\n"; "\r\n") | . + "\r\n\n"'

# jq filter to extract final result
final_result='select(.type == "result").result // empty'

for ((i=1; i<=$1; i++)); do
  tmpfile=$(mktemp)
  trap "rm -f $tmpfile" EXIT

  claude --permission-mode bypassPermissions \
    --print \
    --output-format stream-json --verbose \
    "@prd-connected-accounts.md @plan-connected-accounts.md @progress-connected-accounts.txt \
1. Read the PRD, plan (ordered workstreams/tasks), and progress file. \
2. Find the next incomplete task in plan-connected-accounts.md and implement it. \
3. Run npx tsc --noEmit to verify types. \
4. Mark the task done in plan-connected-accounts.md (strikethrough + checkmark). \
5. Append your progress to progress-connected-accounts.txt (task number, files changed, outcome). \
6. Commit your changes. \
ONLY WORK ON A SINGLE TASK. \
If all tasks in plan-connected-accounts.md are complete, output <promise>COMPLETE</promise>. \
\
Reference these for existing patterns: \
- src/lib/auth/server.ts (better-auth config with Twitter provider) \
- src/lib/auth/client.ts (auth client setup) \
- src/lib/x.ts (X API client, credential lookup) \
- src/lib/env.ts (env var schema with optional X_CLIENT_ID/X_CLIENT_SECRET) \
- src/components/sync-button.tsx (sync dropdown with X actions) \
- src/app/dashboard/dashboard-client.tsx (dashboard layout) \
- src/db/schemas/auth.ts (account table schema) \
- src/lib/constants.tsx (OAUTH_PROVIDERS, APP_CONFIG) \
\
prd-connected-accounts.md has the 'why' for each requirement. plan-connected-accounts.md has the 'what' and 'how'." \
  | grep --line-buffered '^{' \
  | tee "$tmpfile" \
  | jq --unbuffered -rj "$stream_text"

  result=$(jq -r "$final_result" "$tmpfile")

  if [[ "$result" == *"<promise>COMPLETE</promise>"* ]]; then
    echo "Plan complete after $i iterations."
    exit 0
  fi
done
