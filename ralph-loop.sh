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
    "@prd.md @plan.md @progress.txt \
1. Read the PRD, plan (ordered workstreams/tasks), and progress file. \
2. Find the next incomplete task in plan.md and implement it. \
3. Run npx tsc --noEmit to verify types. \
4. Mark the task done in plan.md (strikethrough + checkmark). \
5. Append your progress to progress.txt (task number, files changed, outcome). \
6. If you change database schema, run pnpm db:generate and pnpm db:migrate. \
7. Commit your changes. \
ONLY WORK ON A SINGLE TASK. \
If all tasks in plan.md are complete, output <promise>COMPLETE</promise>. \
\
Reference these for patterns and solutions: \
- docs/adr-001-multi-source-normalized-content-model.md (architecture decision) \
- docs/api-contract-multi-source-v1.md (API contract) \
- docs/multi-source-migration-runbook.md (migration runbook) \
- docs/transition-checklist.md (transition checklist) \
- docs/state-machines.md (state machines) \
\
prd.md has the 'why' for each requirement. plan.md has the 'what' and 'how'." \
  | grep --line-buffered '^{' \
  | tee "$tmpfile" \
  | jq --unbuffered -rj "$stream_text"

  result=$(jq -r "$final_result" "$tmpfile")

  if [[ "$result" == *"<promise>COMPLETE</promise>"* ]]; then
    echo "Plan complete after $i iterations."
    exit 0
  fi
done
