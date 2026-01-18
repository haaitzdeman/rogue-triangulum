# AUDIT_REPORT.md
# Codebase Forensics Audit

**Date:** 2026-01-18
**Auditor:** Automated

---

## 1. Indicator Math in Hooks/Components

### ❌ VIOLATION FOUND: `src/hooks/useLiveScanner.tsx`

```
Line 93:  function calculateRSI(candles: Candle[], period: number = 14): number {
Line 113: function calculateMACD(candles: Candle[]): { macd: number; signal: number; histogram: number } {
Line 115:     const ema12 = calculateEMA(closes, 12);
Line 116:     const ema26 = calculateEMA(closes, 26);
Line 123: function calculateEMA(values: number[], period: number): number {
Line 154:     const rsi = calculateRSI(candles);
Line 155:     const macd = calculateMACD(candles);
```

**Finding:** This hook computes RSI, MACD, EMA directly instead of calling the orchestrator.
**Impact:** Violates single truth path requirement.
**Fix Required:** Rewrite to call orchestrator, remove local indicator math.

### ✅ No violations in:
- `src/components/` - No indicator math found
- `src/app/` - No indicator math found

---

## 2. Old Learning Engine References

### ✅ CLEAN: No imports found

Search for: `meticulous-engine|reinforcement-engine|smart-simulator|daily-simulator|replay-runner`

**Result:** 0 matches in `src/`

The fake learning engines were previously deleted.

---

## 3. Scanner Entry Points

### Current Scanner Usage

| File | Import | Usage |
|------|--------|-------|
| `src/app/swing/page.tsx` | `useLiveScanner` | `useLiveScanner('swing')` |
| `src/app/day-trading/page.tsx` | `useLiveScanner` | `useLiveScanner('day-trading')` |

### Current Flow (BROKEN)
```
UI Page → useLiveScanner hook → LOCAL indicator math → candidates
```

### Required Flow
```
UI Page → useLiveScanner hook → Orchestrator → SwingBrain → Strategies → candidates
```

---

## 4. Specialist Brain Usage

### Status: NOT WIRED

Files exist at `src/lib/brains/specialists/`:
- `day-trading-brain.ts`
- `swing-brain.ts`
- `options-brain.ts`
- `investing-brain.ts`

**Finding:** These files exist but are NOT imported or called from the scanner flow.
The current scanner bypasses them entirely.

---

## 5. Orchestrator

### Status: DOES NOT EXIST

No file at `src/lib/core/orchestrator.ts` or similar.
The architecture lacks a central orchestrator to route requests.

---

## 6. Summary

| Check | Status | Action |
|-------|--------|--------|
| Indicator math in hooks | ❌ FAIL | Rewrite useLiveScanner |
| Old engine imports | ✅ PASS | None |
| Brains wired | ❌ FAIL | Wire SwingBrain to scanner |
| Orchestrator exists | ❌ FAIL | Create orchestrator |
| Single truth path | ❌ FAIL | Implement full flow |

---

## Next Steps

1. Create `src/lib/core/orchestrator.ts`
2. Rewrite `src/hooks/useLiveScanner.tsx` to call orchestrator
3. Wire `SwingBrain` to use strategies from `src/lib/strategies/`
4. Remove all indicator math from hooks
5. Verify single truth path
