# Skill: Truthful Language Guard (No Fake ML/AI Claims)

## Purpose
Ensure all system descriptions are truthful. If the system is calibration, backtesting, ranking, scoring, or evaluation, it must not be described as AI/ML training or learning.

## When to Use
Use whenever writing docs, UI copy, API responses, logs, or explanations about strategy performance, "learning", or improvements.

## Inputs
- Proposed wording (docs, UI labels, variable names, endpoints).
- System behavior (what is actually implemented).

## Outputs
- Approved terminology list used consistently.
- A diff-style list of language changes to apply.

## Hard Rules
1) Disallowed words unless strictly true: "train", "training", "learn", "learning", "AI", "ML model", "neural", "prediction accuracy".
2) Allowed replacements: "calibration", "evaluation", "tracking", "benchmark", "performance", "ranking adjustment", "parameter tuning".
3) If a feature is not implemented, do not imply it exists.
4) If data is delayed or limited by plan/tier, surface it plainly: dataLimited=true or a visible warning.
5) No emojis.

## Procedure
1) Identify every user-facing phrase and variable name tied to "learning".
2) Replace disallowed terms with allowed alternatives.
3) Add explicit constraint notes where needed:
   - "Past performance does not guarantee future results."
   - "No lookahead; future bars are not used to generate signals."
4) Ensure logs and API responses do not overclaim.
5) Produce a "Terminology Contract" section for SYSTEM_TRUTH.md.

## Acceptance Checks
- No disallowed words appear in user-facing copy.
- Claims match implementation.
- Data limit/disclaimer language is present where relevant.
