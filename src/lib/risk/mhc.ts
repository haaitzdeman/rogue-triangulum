/**
 * MHC - Manual Human Check
 * 
 * Safety rules that require explicit user approval before trade execution.
 * This is NOT ML/AI - it's deterministic rule-based risk management.
 * 
 * TERMINOLOGY: "check", "approval", "risk" - NOT "predict" or "learn"
 */

import type { TradeIntent, TradingMode, MHCResult } from '../execution/execution-types';
import { APPROVED_WATCHLIST, MHC_THRESHOLDS } from '../execution/execution-types';

/**
 * Check if a trade intent requires Manual Human Check
 * 
 * Rules (must trigger MHC):
 * - confidence < 0.70
 * - score < 75
 * - symbol not in approved watchlist
 * - any options intent
 * - position size > $1000
 * - ALL live mode trades (always)
 */
export function checkMHC(intent: TradeIntent, mode: TradingMode): MHCResult {
    const reasons: string[] = [];
    const blockedReasons: string[] = [];

    // 1. Live mode ALWAYS requires MHC
    if (mode === 'live') {
        reasons.push('Live trading requires manual approval');
    }

    // 2. Low confidence
    if (intent.source.confidence < MHC_THRESHOLDS.MIN_CONFIDENCE) {
        reasons.push(`Confidence ${(intent.source.confidence * 100).toFixed(0)}% is below threshold (${MHC_THRESHOLDS.MIN_CONFIDENCE * 100}%)`);
    }

    // 3. Low score
    if (intent.source.score < MHC_THRESHOLDS.MIN_SCORE) {
        reasons.push(`Score ${intent.source.score} is below threshold (${MHC_THRESHOLDS.MIN_SCORE})`);
    }

    // 4. Unapproved symbol
    if (!APPROVED_WATCHLIST.includes(intent.symbol)) {
        reasons.push(`Symbol ${intent.symbol} is not in approved watchlist`);
    }

    // 5. Large position
    if (intent.positionValue > MHC_THRESHOLDS.MAX_POSITION_VALUE) {
        reasons.push(`Position value $${intent.positionValue.toFixed(0)} exceeds limit ($${MHC_THRESHOLDS.MAX_POSITION_VALUE})`);
    }

    // 6. Options trades (blocked for now in V1)
    // Check by symbol pattern (e.g., contains expiry)
    if (intent.symbol.match(/\d{6}[CP]\d+/)) {
        blockedReasons.push('Options trades are not supported in V1');
    }

    return {
        requiresMHC: reasons.length > 0 || blockedReasons.length > 0,
        reasons,
        blockedReasons: blockedReasons.length > 0 ? blockedReasons : undefined,
    };
}

/**
 * Format MHC result for display
 */
export function formatMHCReasons(result: MHCResult): string {
    const lines: string[] = [];

    if (result.blockedReasons && result.blockedReasons.length > 0) {
        lines.push('⛔ BLOCKED:');
        result.blockedReasons.forEach(r => lines.push(`  • ${r}`));
    }

    if (result.reasons.length > 0) {
        lines.push('⚠️ Requires approval:');
        result.reasons.forEach(r => lines.push(`  • ${r}`));
    }

    return lines.join('\n');
}

/**
 * Check if trade is completely blocked (cannot proceed even with approval)
 */
export function isTradeBlocked(result: MHCResult): boolean {
    return result.blockedReasons !== undefined && result.blockedReasons.length > 0;
}
