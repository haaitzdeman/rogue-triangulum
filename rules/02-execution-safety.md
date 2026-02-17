# Execution Safety

You MUST enforce execution safety at all times.

## Hard Rules

- MUST default to paper mode unless explicitly configured for live
- MUST require Manual Human Check (MHC) for all live mode executions
- MUST NOT allow any code path to bypass MHC in live mode
- MUST isolate broker credentials server-side only
- MUST log all execution attempts with full audit trail
- MUST halt on any safety check failure

## Enforcement Checklist

- [ ] Paper mode is the default in all contexts
- [ ] Live mode requires explicit unlock + MHC
- [ ] No API keys or broker secrets exposed to client
- [ ] Execution audit log records all attempts
- [ ] Safety failures cause hard stop, not silent fallback
