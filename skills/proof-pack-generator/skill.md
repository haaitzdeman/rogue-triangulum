# Skill: Proof Pack Generator (Raw Verifiable Outputs)

## Purpose
Produce verifiable, raw proof outputs for changes: build, typecheck, tests, grep isolation, and API behavior.

## When to Use
Use after any implementation or refactor that touches logic, safety, data persistence, or APIs.

## Inputs
- Repo path
- Commands available (npm, tsc, jest, grep, curl)
- Specific invariants to prove

## Outputs
- A proof pack with:
  1) exact commands
  2) exact outputs (not truncated)
  3) file snippets for key lines
  4) grep proofs for isolation

## Hard Rules
1) Never paste truncated output; if a terminal truncates, rerun with a method that prints fully.
2) Always include exit codes.
3) Grep proofs must show file paths and line numbers.
4) API proofs must show:
   - request body
   - HTTP status
   - response JSON
   - persistence diff (line count before/after)
5) No emojis.

## Procedure
1) Build proof:
   - npm run build
2) Typecheck proof:
   - npx tsc --noEmit
3) Test proof:
   - npx jest --no-cache
4) Isolation proof:
   - grep for broker imports / critical constructors
5) API proof:
   - curl/Invoke-RestMethod for success and failure cases
6) Persistence proof:
   - wc -l / byte count before and after writes

## Acceptance Checks
- Proof pack is sufficient for a reviewer to reproduce results.
- Outputs contain no ellipses or terminal clipping.
