/**
 * Options Engine Types
 *
 * Core type definitions for the options scanning and evaluation system.
 * Rule-based analysis — no ML/AI terminology.
 */

// =============================================================================
// Contract Types
// =============================================================================

export type OptionType = 'CALL' | 'PUT';

export interface OptionContract {
    /** Full contract symbol (e.g. O:AAPL250221C00150000) */
    symbol: string;
    /** Strike price */
    strike: number;
    /** Expiration date (YYYY-MM-DD) */
    expiration: string;
    /** Call or put */
    type: OptionType;
    /** Current bid price */
    bid: number;
    /** Current ask price */
    ask: number;
    /** Mid price: (bid + ask) / 2 */
    mid: number;
    /** Volume traded today */
    volume: number;
    /** Open interest */
    openInterest: number;
    /** Implied volatility (decimal, e.g. 0.35 = 35%) */
    impliedVolatility: number;
    /** Days until expiration */
    daysToExpiration: number;
    /** Bid-ask spread as percentage of mid */
    bidAskSpreadPct: number;
}

// =============================================================================
// Liquidity Configuration
// =============================================================================

export interface LiquidityConfig {
    /** Minimum open interest to qualify (default: 200) */
    minOpenInterest: number;
    /** Minimum volume to qualify (default: 50) */
    minVolume: number;
    /** Maximum bid-ask spread as % (default: 10) */
    maxBidAskSpreadPct: number;
}

export const DEFAULT_LIQUIDITY_CONFIG: LiquidityConfig = {
    minOpenInterest: 200,
    minVolume: 50,
    maxBidAskSpreadPct: 10,
};

// =============================================================================
// Strategy Types
// =============================================================================

export type StrategySuggestion =
    | 'LONG_CALL'
    | 'LONG_PUT'
    | 'DEBIT_SPREAD'
    | 'CREDIT_SPREAD'
    | 'AVOID';

// Alias for compatibility (same values)
export type Strategy = StrategySuggestion;

export interface RecommendedContract {
    /** Full option ticker (e.g. O:AAPL250221C00150000) */
    ticker: string;
    /** Call or put */
    type: 'call' | 'put';
    /** Strike price */
    strike: number;
    /** Expiration date YYYY-MM-DD */
    expiration: string;
    /** Mid price computed from bid/ask */
    mid?: number;
    /** Bid price */
    bid?: number;
    /** Ask price */
    ask?: number;
    /** Open interest */
    oi?: number;
    /** Volume */
    volume?: number;
    /** Bid-ask spread as % of mid */
    spreadPct?: number;
}

export interface SpreadLegs {
    short: RecommendedContract;
    long: RecommendedContract;
    /** Net credit received (for credit spreads) */
    netCredit?: number;
    /** Net debit paid (for debit spreads) */
    netDebit?: number;
    /** Maximum potential loss */
    maxLoss?: number;
    /** Breakeven price */
    breakeven?: number;
}

export interface RecommendedTrade {
    /** Selected strategy */
    strategy: Strategy;
    /** DTE targeting window */
    dteTarget: { min: number; max: number; selected?: number };
    /** Selected contract (for single-leg strategies) */
    contract?: RecommendedContract;
    /** Spread legs (for spread strategies) */
    spreadLegs?: SpreadLegs;
    /** Plain-language entry plan */
    entryPlan: string;
    /** Plain-language invalidation */
    invalidation: string;
    /** Risk notes */
    riskNotes: string[];
}

export type IVRankClassification = 'HIGH' | 'MID' | 'LOW';

export interface IVRankResult {
    /** IV rank value 0–1, or null if insufficient data */
    rank: number | null;
    /** Classification: HIGH (>0.6), MID (0.3–0.6), LOW (<0.3) */
    classification: IVRankClassification | null;
    /** Set to true if historical IV data was not available */
    lowData: boolean;
}

export interface ExpectedMoveResult {
    /** Expected move in dollars */
    expectedMove: number;
    /** Expected range */
    expectedRange: {
        low: number;
        high: number;
    };
}

// =============================================================================
// Scan Result
// =============================================================================

export interface OptionScanCandidate {
    /** Underlying ticker symbol */
    underlyingSymbol: string;
    /** Current underlying stock price */
    underlyingPrice: number;
    /** IV rank result */
    ivRank: IVRankResult;
    /** Expected move for nearest expiration */
    expectedMove: ExpectedMoveResult;
    /** Liquidity score (0–100) based on avg OI/volume of filtered contracts */
    liquidityScore: number;
    /** Recommended strategy */
    strategySuggestion: StrategySuggestion;
    /** Human-readable rationale for the suggestion */
    rationale: string;
    /** Filtered contracts that passed liquidity checks */
    contracts: OptionContract[];
    /** Total contracts before liquidity filtering */
    totalContractsScanned: number;
    /** Timestamp of scan */
    scannedAt: string;
    /** Actionable recommended trade (populated by contract selector) */
    recommendedTrade?: RecommendedTrade;
}

// =============================================================================
// API Response Types
// =============================================================================

export interface OptionScanResponse {
    success: boolean;
    data?: OptionScanCandidate;
    error?: string;
    errorCode?: string;
}
