# Skill: Conversation Discipline (No Prior-Chat References)

## Purpose
Prevent derailing, repetition, and references to prior chat messages. Keep outputs self-contained and on-track.

## When to Use
Use this skill in every response by default.

## Inputs
- Current user request only.
- Any code/files explicitly provided in the current message.
- Any URLs explicitly provided in the current message.

## Outputs
- A self-contained response that does not reference earlier chat turns.
- If history is required, ask for the missing artifact explicitly (file, snippet, link).

## Hard Rules
1) Do not say: "as we discussed", "earlier", "previously", "you mentioned", "last time", "again", or similar.
2) Do not summarize or rely on prior conversation context unless the user pasted it in the current message.
3) If a detail is unknown and not provided in the current message, either:
   a) choose a safe default and label it as a default, or
   b) ask a single targeted question ONLY if the work cannot proceed without it.
4) Never repeat the same point more than once in the same response.
5) No emojis.

## Procedure
1) Restate the current request in one sentence without referencing prior messages.
2) Identify required inputs: what is provided vs missing.
3) If missing inputs are non-secret and blocking, ask ONE question; otherwise pick defaults.
4) Produce output in the exact requested format: copy/paste ready, no placeholders.
5) End with a short acceptance checklist (3–7 items).

## Acceptance Checks
- Response contains no prior-chat references.
- Response has zero emojis.
- Output is directly usable without guesswork.
