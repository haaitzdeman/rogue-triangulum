## Goal
Decide if a TradeIntent may proceed to execution.

## Steps
1. Assess requestedMode vs effectiveMode.
2. Apply MHC rules via MHC Enforcement Skill.
3. Apply risk limits (position size, trade frequency).
4. Return a recommended action:
   - reject: with reasons
   - proceed: with flags (paper/live)
