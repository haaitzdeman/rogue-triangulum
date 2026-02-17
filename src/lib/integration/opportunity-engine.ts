/**
 * Opportunity Engine
 *
 * Cross-references premarket gap signals with options scan results
 * to produce a unified opportunity score.
 *
 * Deterministic scoring — no randomness, no ML.
 * Score capped at 100.
 *
 * TERMINOLOGY: "Scoring", "Ranking", "Cross-reference"
 * NOT: "Training", "Learning", "AI", "ML"
 */

import type { GapCandidate } from '@/lib/premarket/premarket-types';
import type { OptionScanCandidate, StrategySuggestion } from '@/lib/options/options-types';

// =============================================================================
// Types
// =============================================================================

export type Alignment = 'ALIGNED' | 'PARTIAL' | 'CONFLICT' | 'NONE';

export interface OpportunityScore {
    /** Overall score 0–100 */
    overallScore: number;
    /** How well premarket and options signals agree */
    alignment: Alignment;
    /** Human-readable reasoning for the score */
    reasoning: string[];
}

export interface RankedOpportunity {
    symbol: string;
    overallScore: number;
    alignment: Alignment;
    reasoning: string[];
    premarket: {
        direction: 'UP' | 'DOWN';
        gapPct: number;
        playType: string;
        confidence: string;
        hitRate: number;
        sampleSize: number;
    } | null;
    options: {
        strategySuggestion: string;
        ivRankValue: number | null;
        ivRankClassification: string | null;
        expectedMove: number;
        liquidityScore: number;
        underlyingPrice: number;
    } | null;
}

// =============================================================================
// Alignment Logic
// =============================================================================

/**
 * Determine if the premarket direction aligns with the options strategy.
 *
 * ALIGNED: Bullish gap + LONG_CALL or DEBIT_SPREAD, Bearish gap + LONG_PUT
 *          High IV gap + CREDIT_SPREAD (selling premium into volatility)
 * CONFLICT: Bullish gap + LONG_PUT, Bearish gap + LONG_CALL
 * PARTIAL: One system doesn't have clear direction
 * NONE: No data from either
 */
function computeAlignment(
    premarket: GapCandidate | null,
    options: OptionScanCandidate | null,
): Alignment {
    // NONE: nothing from either system
    if (!premarket && !options) return 'NONE';

    // PARTIAL: only one system has data
    if (!premarket || !options) return 'PARTIAL';

    // AVOID from premarket means no trade signal
    if (premarket.playType === 'AVOID') return 'PARTIAL';

    // AVOID from options means no trade signal
    if (options.strategySuggestion === 'AVOID') return 'PARTIAL';

    const isBullish = premarket.direction === 'UP';
    const strategy = options.strategySuggestion as StrategySuggestion;

    // High IV + any gap direction = CREDIT_SPREAD is fine (selling premium)
    if (strategy === 'CREDIT_SPREAD') {
        // Credit spreads work in any direction with high IV — aligned
        return 'ALIGNED';
    }

    // Check direction agreement
    if (isBullish && (strategy === 'LONG_CALL' || strategy === 'DEBIT_SPREAD')) {
        return 'ALIGNED';
    }

    if (!isBullish && (strategy === 'LONG_PUT' || strategy === 'DEBIT_SPREAD')) {
        return 'ALIGNED';
    }

    // Direct conflict: bullish gap + long put, or bearish gap + long call
    if (isBullish && strategy === 'LONG_PUT') return 'CONFLICT';
    if (!isBullish && strategy === 'LONG_CALL') return 'CONFLICT';

    // Anything else is partial
    return 'PARTIAL';
}

// =============================================================================
// Scoring
// =============================================================================

/**
 * Compute a deterministic opportunity score from premarket + options signals.
 *
 * Score breakdown (max 100):
 * - Premarket confidence HIGH: +20
 * - Premarket playType != AVOID: +15
 * - Options IV alignment: +15
 * - Liquidity score > 50: +10
 * - Analog sample size >= 30: +10
 * - Hit rate > 55%: +10
 * - Direction alignment: +10
 * - Non-low-data IV: +10
 *
 * Total theoretical max = 100
 */
export function computeOpportunityScore(
    premarket: GapCandidate | null,
    options: OptionScanCandidate | null,
): OpportunityScore {
    const alignment = computeAlignment(premarket, options);
    const reasoning: string[] = [];
    let score = 0;

    // --- Premarket scoring ---
    if (premarket) {
        // +20 for HIGH confidence
        if (premarket.confidence === 'HIGH') {
            score += 20;
            reasoning.push('Premarket signal has HIGH confidence (+20)');
        } else {
            reasoning.push('Premarket signal has LOW confidence (+0)');
        }

        // +15 for actionable play type (CONTINUATION or FADE)
        if (premarket.playType !== 'AVOID') {
            score += 15;
            reasoning.push(`Premarket play type: ${premarket.playType} (+15)`);
        } else {
            reasoning.push('Premarket play type is AVOID (+0)');
        }

        // +10 for adequate analog sample
        if (premarket.analogStats.sampleSize >= 30) {
            score += 10;
            reasoning.push(`Analog sample size: ${premarket.analogStats.sampleSize} (≥30, +10)`);
        } else {
            reasoning.push(`Analog sample size: ${premarket.analogStats.sampleSize} (<30, +0)`);
        }

        // +10 for good hit rate
        if (premarket.analogStats.hitRate > 55) {
            score += 10;
            reasoning.push(`Analog hit rate: ${premarket.analogStats.hitRate.toFixed(1)}% (>55%, +10)`);
        } else {
            reasoning.push(`Analog hit rate: ${premarket.analogStats.hitRate.toFixed(1)}% (≤55%, +0)`);
        }
    } else {
        reasoning.push('No premarket signal available (+0)');
    }

    // --- Options scoring ---
    if (options) {
        // +15 for IV alignment
        const ivClass = options.ivRank.classification;
        const strategy = options.strategySuggestion;

        const ivAligned =
            (ivClass === 'HIGH' && strategy === 'CREDIT_SPREAD') ||
            (ivClass === 'LOW' && (strategy === 'DEBIT_SPREAD' || strategy === 'LONG_CALL' || strategy === 'LONG_PUT'));

        if (ivAligned) {
            score += 15;
            reasoning.push(`IV rank ${ivClass} aligns with ${strategy} (+15)`);
        } else if (strategy !== 'AVOID') {
            reasoning.push(`IV rank ${ivClass ?? 'N/A'} does not strongly align with ${strategy} (+0)`);
        }

        // +10 for good liquidity
        if (options.liquidityScore > 50) {
            score += 10;
            reasoning.push(`Options liquidity score: ${options.liquidityScore}/100 (>50, +10)`);
        } else {
            reasoning.push(`Options liquidity score: ${options.liquidityScore}/100 (≤50, +0)`);
        }

        // +10 for non-low-data IV
        if (!options.ivRank.lowData && options.ivRank.rank !== null) {
            score += 10;
            reasoning.push(`IV data available: rank ${(options.ivRank.rank * 100).toFixed(0)}% (+10)`);
        } else {
            reasoning.push('IV data insufficient (LOW_DATA, +0)');
        }
    } else {
        reasoning.push('No options scan available (+0)');
    }

    // --- Cross-system alignment ---
    if (alignment === 'ALIGNED') {
        score += 10;
        reasoning.push('Premarket + options signals are ALIGNED (+10)');
    } else if (alignment === 'CONFLICT') {
        // Penalty for conflict
        score = Math.max(0, score - 10);
        reasoning.push('Premarket + options signals CONFLICT (−10)');
    } else if (alignment === 'PARTIAL') {
        reasoning.push('Only partial signal coverage (+0)');
    } else {
        reasoning.push('No signals from either system (+0)');
    }

    // Cap at 100
    const finalScore = Math.min(100, Math.max(0, score));

    return {
        overallScore: finalScore,
        alignment,
        reasoning,
    };
}

/**
 * Build a ranked opportunity from raw signals.
 */
export function buildRankedOpportunity(
    symbol: string,
    premarket: GapCandidate | null,
    options: OptionScanCandidate | null,
): RankedOpportunity {
    const { overallScore, alignment, reasoning } = computeOpportunityScore(premarket, options);

    return {
        symbol,
        overallScore,
        alignment,
        reasoning,
        premarket: premarket ? {
            direction: premarket.direction,
            gapPct: premarket.gapPct,
            playType: premarket.playType,
            confidence: premarket.confidence,
            hitRate: premarket.analogStats.hitRate,
            sampleSize: premarket.analogStats.sampleSize,
        } : null,
        options: options ? {
            strategySuggestion: options.strategySuggestion,
            ivRankValue: options.ivRank.rank,
            ivRankClassification: options.ivRank.classification,
            expectedMove: options.expectedMove.expectedMove,
            liquidityScore: options.liquidityScore,
            underlyingPrice: options.underlyingPrice,
        } : null,
    };
}
