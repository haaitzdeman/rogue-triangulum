/**
 * Contract Selector — Deterministic Contract/Leg Picking
 *
 * Pure rule-based logic for selecting specific option contracts or spread legs.
 * No ML/AI. All decisions are deterministic based on:
 *   - Strategy type
 *   - Underlying price
 *   - Available contracts
 *   - Liquidity filters
 *   - DTE targeting (7–21 days)
 */

import type {
    OptionContract,
    StrategySuggestion,
    RecommendedTrade,
    RecommendedContract,
    SpreadLegs,
} from './options-types';

// =============================================================================
// Constants
// =============================================================================

const DTE_MIN = 7;
const DTE_MAX = 21;

// Spread width based on underlying price
function getSpreadWidth(price: number): number {
    if (price < 50) return 1;
    if (price <= 200) return 2;
    return 5;
}

// =============================================================================
// Helpers
// =============================================================================

function toRecommendedContract(c: OptionContract): RecommendedContract {
    return {
        ticker: c.symbol,
        type: c.type === 'CALL' ? 'call' : 'put',
        strike: c.strike,
        expiration: c.expiration,
        mid: c.mid > 0 ? c.mid : undefined,
        bid: c.bid > 0 ? c.bid : undefined,
        ask: c.ask > 0 ? c.ask : undefined,
        oi: c.openInterest > 0 ? c.openInterest : undefined,
        volume: c.volume > 0 ? c.volume : undefined,
        spreadPct: c.bidAskSpreadPct > 0 ? c.bidAskSpreadPct : undefined,
    };
}

/**
 * Get contracts within the DTE target window, preferring best liquidity.
 * Returns contracts sorted by (OI * volume) descending.
 */
function filterByDTE(contracts: OptionContract[]): OptionContract[] {
    const inWindow = contracts.filter(c => c.daysToExpiration >= DTE_MIN && c.daysToExpiration <= DTE_MAX);
    if (inWindow.length > 0) return inWindow.sort((a, b) => (b.openInterest * b.volume) - (a.openInterest * a.volume));

    // Fallback: closest to DTE target range
    const sorted = [...contracts].sort((a, b) => {
        const aDist = a.daysToExpiration < DTE_MIN ? DTE_MIN - a.daysToExpiration : a.daysToExpiration - DTE_MAX;
        const bDist = b.daysToExpiration < DTE_MIN ? DTE_MIN - b.daysToExpiration : b.daysToExpiration - DTE_MAX;
        return aDist - bDist;
    });
    return sorted;
}

/**
 * Select the best expiration date from available contracts within DTE window.
 */
function selectExpiration(contracts: OptionContract[]): { expiration: string; dte: number } | null {
    const dteFiltered = filterByDTE(contracts);
    if (dteFiltered.length === 0) return null;

    // Group by expiration, sum liquidity score
    const byExp = new Map<string, { dte: number; score: number }>();
    for (const c of dteFiltered) {
        const existing = byExp.get(c.expiration) || { dte: c.daysToExpiration, score: 0 };
        existing.score += (c.openInterest + c.volume);
        byExp.set(c.expiration, existing);
    }

    // Pick expiration with best liquidity
    let bestExp = '';
    let bestScore = -1;
    let bestDte = 0;
    byExp.forEach((v, k) => {
        if (v.score > bestScore) {
            bestScore = v.score;
            bestExp = k;
            bestDte = v.dte;
        }
    });

    return bestExp ? { expiration: bestExp, dte: bestDte } : null;
}

// =============================================================================
// Single-Leg Selection (LONG_CALL / LONG_PUT)
// =============================================================================

function selectSingleLeg(
    contracts: OptionContract[],
    underlyingPrice: number,
    optionType: 'CALL' | 'PUT',
    isBullish: boolean,
): RecommendedTrade | null {
    const typedContracts = contracts.filter(c => c.type === optionType);
    if (typedContracts.length === 0) return null;

    const exp = selectExpiration(typedContracts);
    if (!exp) return null;

    // Within selected expiration, pick nearest ATM
    const expiryContracts = typedContracts
        .filter(c => c.expiration === exp.expiration)
        .sort((a, b) => Math.abs(a.strike - underlyingPrice) - Math.abs(b.strike - underlyingPrice));

    const best = expiryContracts[0];
    if (!best) return null;

    const strategy = optionType === 'CALL' ? 'LONG_CALL' : 'LONG_PUT';
    const direction = isBullish ? 'bullish' : 'bearish';

    return {
        strategy,
        dteTarget: { min: DTE_MIN, max: DTE_MAX, selected: exp.dte },
        contract: toRecommendedContract(best),
        entryPlan: `Buy ${optionType.toLowerCase()} at $${best.strike} strike, ${exp.expiration} expiration. Enter near mid price ($${best.mid.toFixed(2)}). ${direction} directional play.`,
        invalidation: `Exit if underlying moves ${optionType === 'CALL' ? 'below' : 'above'} $${(optionType === 'CALL' ? underlyingPrice * 0.97 : underlyingPrice * 1.03).toFixed(2)} or if premium decays 50%+.`,
        riskNotes: [
            `Max loss: $${(best.mid * 100).toFixed(0)} per contract`,
            `Nearest ATM strike selected ($${best.strike} vs price $${underlyingPrice.toFixed(2)})`,
            `DTE: ${exp.dte} days`,
        ],
    };
}

// =============================================================================
// Spread Selection
// =============================================================================

function selectCreditSpread(
    contracts: OptionContract[],
    underlyingPrice: number,
    isBullish: boolean,
): RecommendedTrade | null {
    // Bearish → call credit spread (sell call above price, buy further above)
    // Bullish → put credit spread (sell put below price, buy further below)
    const optionType: 'CALL' | 'PUT' = isBullish ? 'PUT' : 'CALL';
    const width = getSpreadWidth(underlyingPrice);

    const typedContracts = contracts.filter(c => c.type === optionType);
    const exp = selectExpiration(typedContracts);
    if (!exp) return null;

    const expiryContracts = typedContracts
        .filter(c => c.expiration === exp.expiration)
        .sort((a, b) => a.strike - b.strike);

    if (expiryContracts.length < 2) return null;

    // Find short leg: 1-3% OTM
    const otmPct = 0.02; // 2% OTM target
    let shortLeg: OptionContract | null = null;

    if (optionType === 'CALL') {
        // Sell call above price
        const target = underlyingPrice * (1 + otmPct);
        const candidates = expiryContracts
            .filter(c => c.strike >= underlyingPrice)
            .sort((a, b) => Math.abs(a.strike - target) - Math.abs(b.strike - target));
        shortLeg = candidates[0] || null;
    } else {
        // Sell put below price
        const target = underlyingPrice * (1 - otmPct);
        const candidates = expiryContracts
            .filter(c => c.strike <= underlyingPrice)
            .sort((a, b) => Math.abs(a.strike - target) - Math.abs(b.strike - target));
        shortLeg = candidates[0] || null;
    }

    if (!shortLeg) return null;

    // Find long leg: width away from short
    const longStrike = optionType === 'CALL' ? shortLeg.strike + width : shortLeg.strike - width;
    const longLeg = expiryContracts.find(c => c.strike === longStrike);

    if (!longLeg) {
        // Try closest available
        const closest = expiryContracts
            .filter(c => (optionType === 'CALL' ? c.strike > shortLeg!.strike : c.strike < shortLeg!.strike))
            .sort((a, b) => Math.abs(a.strike - longStrike) - Math.abs(b.strike - longStrike));
        if (closest.length === 0) return null;
        return buildSpread(shortLeg, closest[0], underlyingPrice, exp, true, width);
    }

    return buildSpread(shortLeg, longLeg, underlyingPrice, exp, true, width);
}

function selectDebitSpread(
    contracts: OptionContract[],
    underlyingPrice: number,
    isBullish: boolean,
): RecommendedTrade | null {
    // Bullish → call debit spread (buy call near ATM, sell further OTM)
    // Bearish → put debit spread (buy put near ATM, sell further OTM)
    const optionType: 'CALL' | 'PUT' = isBullish ? 'CALL' : 'PUT';
    const width = getSpreadWidth(underlyingPrice);

    const typedContracts = contracts.filter(c => c.type === optionType);
    const exp = selectExpiration(typedContracts);
    if (!exp) return null;

    const expiryContracts = typedContracts
        .filter(c => c.expiration === exp.expiration)
        .sort((a, b) => a.strike - b.strike);

    if (expiryContracts.length < 2) return null;

    // Buy leg: nearest ATM
    const buyLeg = expiryContracts
        .sort((a, b) => Math.abs(a.strike - underlyingPrice) - Math.abs(b.strike - underlyingPrice))[0];
    if (!buyLeg) return null;

    // Sell leg: width away OTM
    const sellStrike = optionType === 'CALL' ? buyLeg.strike + width : buyLeg.strike - width;
    const sellLeg = expiryContracts.find(c => c.strike === sellStrike);

    if (!sellLeg) {
        const closest = expiryContracts
            .filter(c => (optionType === 'CALL' ? c.strike > buyLeg.strike : c.strike < buyLeg.strike))
            .sort((a, b) => Math.abs(a.strike - sellStrike) - Math.abs(b.strike - sellStrike));
        if (closest.length === 0) return null;
        return buildSpread(closest[0], buyLeg, underlyingPrice, exp, false, width);
    }

    return buildSpread(sellLeg, buyLeg, underlyingPrice, exp, false, width);
}

function buildSpread(
    shortContract: OptionContract,
    longContract: OptionContract,
    underlyingPrice: number,
    exp: { expiration: string; dte: number },
    isCredit: boolean,
    width: number,
): RecommendedTrade {
    const shortRec = toRecommendedContract(shortContract);
    const longRec = toRecommendedContract(longContract);

    const actualWidth = Math.abs(shortContract.strike - longContract.strike);

    const legs: SpreadLegs = {
        short: shortRec,
        long: longRec,
    };

    // Compute net credit/debit
    if (shortContract.mid > 0 && longContract.mid > 0) {
        if (isCredit) {
            const netCredit = shortContract.mid - longContract.mid;
            legs.netCredit = Math.round(netCredit * 100) / 100;
            legs.maxLoss = Math.round((actualWidth - Math.max(netCredit, 0)) * 100) / 100;
            // Breakeven for credit spread
            if (shortContract.type === 'PUT') {
                legs.breakeven = Math.round((shortContract.strike - Math.max(netCredit, 0)) * 100) / 100;
            } else {
                legs.breakeven = Math.round((shortContract.strike + Math.max(netCredit, 0)) * 100) / 100;
            }
        } else {
            const netDebit = longContract.mid - shortContract.mid;
            legs.netDebit = Math.round(netDebit * 100) / 100;
            legs.maxLoss = Math.round(Math.max(netDebit, 0) * 100) / 100;
            // Breakeven for debit spread
            if (longContract.type === 'CALL') {
                legs.breakeven = Math.round((longContract.strike + Math.max(netDebit, 0)) * 100) / 100;
            } else {
                legs.breakeven = Math.round((longContract.strike - Math.max(netDebit, 0)) * 100) / 100;
            }
        }
    }

    const strategy = isCredit ? 'CREDIT_SPREAD' : 'DEBIT_SPREAD';
    const directionLabel = isCredit ? 'credit' : 'debit';

    return {
        strategy,
        dteTarget: { min: DTE_MIN, max: DTE_MAX, selected: exp.dte },
        spreadLegs: legs,
        entryPlan: `${isCredit ? 'Sell' : 'Buy'} $${(isCredit ? shortContract : longContract).strike}/$${(isCredit ? longContract : shortContract).strike} ${shortContract.type.toLowerCase()} ${directionLabel} spread, ${exp.expiration} expiration. Width: $${actualWidth}. Target fill near ${legs.netCredit ? `$${legs.netCredit} credit` : `$${legs.netDebit} debit`}.`,
        invalidation: `Exit if underlying moves ${isCredit ? 'through' : 'away from'} the spread strikes. Max loss: $${((legs.maxLoss ?? actualWidth) * 100).toFixed(0)}/contract.`,
        riskNotes: [
            `Width: $${width} (actual: $${actualWidth})`,
            `Max loss per contract: $${((legs.maxLoss ?? actualWidth) * 100).toFixed(0)}`,
            legs.netCredit ? `Net credit: $${legs.netCredit.toFixed(2)}/share ($${(legs.netCredit * 100).toFixed(0)}/contract)` : '',
            legs.netDebit ? `Net debit: $${legs.netDebit.toFixed(2)}/share ($${(legs.netDebit * 100).toFixed(0)}/contract)` : '',
            legs.breakeven ? `Breakeven: $${legs.breakeven.toFixed(2)}` : '',
            `DTE: ${exp.dte} days`,
        ].filter(Boolean),
    };
}

// =============================================================================
// Main Selector
// =============================================================================

/**
 * Select a specific contract or spread legs for a given strategy.
 *
 * Deterministic: same inputs always produce same output.
 *
 * @param strategy - The strategy chosen by the decision layer
 * @param contracts - Filtered contracts from the chain provider
 * @param underlyingPrice - Current underlying stock price
 * @param priceChangePct - Today's price change percentage (for direction bias)
 */
export function selectContract(
    strategy: StrategySuggestion,
    contracts: OptionContract[],
    underlyingPrice: number,
    priceChangePct?: number,
): RecommendedTrade | null {
    if (strategy === 'AVOID' || contracts.length === 0) {
        return null;
    }

    const isBullish = (priceChangePct ?? 0) >= 0;

    switch (strategy) {
        case 'LONG_CALL':
            return selectSingleLeg(contracts, underlyingPrice, 'CALL', true);

        case 'LONG_PUT':
            return selectSingleLeg(contracts, underlyingPrice, 'PUT', false);

        case 'CREDIT_SPREAD':
            return selectCreditSpread(contracts, underlyingPrice, isBullish);

        case 'DEBIT_SPREAD':
            return selectDebitSpread(contracts, underlyingPrice, isBullish);

        default:
            return null;
    }
}
