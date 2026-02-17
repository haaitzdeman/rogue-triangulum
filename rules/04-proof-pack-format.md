# Proof Pack Format

You MUST provide verifiable proof for all implementation claims.

## Hard Rules

- MUST include `npx tsc --noEmit` result (exit 0 required)
- MUST include `npm run build` result (exit 0 required)
- MUST include `npx jest` result with pass/fail counts
- MUST show actual command output, not summaries
- MUST NOT claim success without showing proof commands executed

## Standard Proof Pack Format

```
| Command | Result |
|---------|--------|
| `npx tsc --noEmit` | ✅ PASS (exit 0) |
| `npm run build` | ✅ PASS (exit 0) |
| `npx jest` | ✅ N/N tests pass |
```

## Enforcement Checklist

- [ ] TypeScript compiles without errors
- [ ] Production build succeeds
- [ ] All tests pass
- [ ] Command outputs shown (not just claimed)
- [ ] Proof pack presented in standard table format
