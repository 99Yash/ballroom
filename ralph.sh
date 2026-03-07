#!/bin/bash

claude --permission-mode acceptEdits "@prd.md @plan.md @progress.txt \
1. Read the PRD, plan (ordered workstreams/tasks), and progress file. \
2. Find the next incomplete task in plan.md and implement it. \
3. Update progress.txt with what you did (task number, files changed, outcome). \
4. If you change database schema, run pnpm db:generate and pnpm db:migrate. \
ONLY DO ONE TASK AT A TIME. Do not add or commit files. \
\
Reference these for patterns and solutions: \
- docs/adr-001-multi-source-normalized-content-model.md (architecture decision) \
- docs/api-contract-multi-source-v1.md (API contract) \
- docs/multi-source-migration-runbook.md (migration runbook) \
- docs/transition-checklist.md (transition checklist) \
- docs/state-machines.md (state machines) \
\
When implementing, check plan.md for the specific workstream and deliverables. \
prd.md has the 'why' for each requirement. \
Run npx tsc --noEmit after changes to verify types."
