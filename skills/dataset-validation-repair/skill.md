## Goal
Determine dataset health and fix simple gaps.

## Steps
1. Read dataset manifest for symbol completeness.
2. If missing bars < threshold, attempt safe backfill.
3. If incompleteness > threshold, mark symbol invalid.
4. Log diagnostic details.

## Constraints
- MUST NOT fabricate data without rule justification.
- MUST produce audit logs for transparency.
