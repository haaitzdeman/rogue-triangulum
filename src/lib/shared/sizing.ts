/**
 * Position Sizing Library — Pure Computation Functions
 *
 * Deterministic sizing computations for both stock/premarket
 * and options positions. No side effects. No API calls.
 *
 * Risk Modes:
 * - CONTRACTS: User specifies number of contracts/shares directly
 * - RISK_DOLLARS: User specifies max dollar risk → compute shares/contracts
 * - RISK_PERCENT: User specifies % of account → compute max risk then shares/contracts
 */

// =============================================================================
// Types
// =============================================================================

export type RiskMode = 'CONTRACTS' | 'RISK_DOLLARS' | 'RISK_PERCENT';

export interface StockSizingInput {
    riskMode: RiskMode;
    riskValue: number;
    entryPrice: number;
    stopPrice: number;
    accountSize?: number;
}

export interface StockSizingResult {
    suggestedShares: number;
    maxLossDollars: number;
    riskPerShare: number;
    assumptions: string[];
}

export interface OptionSizingInput {
    riskMode: RiskMode;
    riskValue: number;
    /** Strategy type */
    strategy: 'LONG_CALL' | 'LONG_PUT' | 'CREDIT_SPREAD' | 'DEBIT_SPREAD';
    /** Mid-price of single contract or net debit */
    contractMid?: number;
    /** Spread width in dollars (for spreads) */
    spreadWidth?: number;
    /** Net credit received (for credit spreads) */
    netCredit?: number;
    /** Account size for RISK_PERCENT mode */
    accountSize?: number;
}

export interface OptionSizingResult {
    suggestedContracts: number;
    maxLossDollars: number;
    buyingPowerEstimate?: number;
    assumptions: string[];
}

// =============================================================================
// Stock Sizing
// =============================================================================

export function computeStockSizing(input: StockSizingInput): StockSizingResult {
    const { riskMode, riskValue, entryPrice, stopPrice, accountSize } = input;
    const assumptions: string[] = [];

    // Risk per share = distance between entry and stop
    const riskPerShare = Math.abs(entryPrice - stopPrice);
    if (riskPerShare <= 0) {
        return {
            suggestedShares: 0,
            maxLossDollars: 0,
            riskPerShare: 0,
            assumptions: ['Entry and stop price are the same — no risk per share computed.'],
        };
    }

    let maxRiskDollars: number;

    switch (riskMode) {
        case 'CONTRACTS': {
            // "CONTRACTS" for stock = number of shares
            const shares = Math.max(Math.round(riskValue), 0);
            const maxLoss = shares * riskPerShare;
            assumptions.push(`Direct share count: ${shares} shares specified`);
            return { suggestedShares: shares, maxLossDollars: round2(maxLoss), riskPerShare: round2(riskPerShare), assumptions };
        }

        case 'RISK_DOLLARS': {
            maxRiskDollars = riskValue;
            assumptions.push(`Max risk: $${maxRiskDollars.toFixed(2)}`);
            break;
        }

        case 'RISK_PERCENT': {
            if (!accountSize || accountSize <= 0) {
                return {
                    suggestedShares: 0,
                    maxLossDollars: 0,
                    riskPerShare: round2(riskPerShare),
                    assumptions: ['Account size required for RISK_PERCENT mode.'],
                };
            }
            maxRiskDollars = (riskValue / 100) * accountSize;
            assumptions.push(`${riskValue}% of $${accountSize.toLocaleString()} = $${maxRiskDollars.toFixed(2)} max risk`);
            break;
        }

        default:
            return {
                suggestedShares: 0,
                maxLossDollars: 0,
                riskPerShare: round2(riskPerShare),
                assumptions: [`Unknown risk mode: ${riskMode}`],
            };
    }

    const suggestedShares = Math.max(Math.floor(maxRiskDollars / riskPerShare), 0);
    const maxLossDollars = suggestedShares * riskPerShare;

    assumptions.push(`Risk per share: $${riskPerShare.toFixed(2)} (|$${entryPrice} - $${stopPrice}|)`);
    assumptions.push(`Suggested shares: ${suggestedShares} (= $${maxRiskDollars.toFixed(2)} / $${riskPerShare.toFixed(2)})`);

    return {
        suggestedShares,
        maxLossDollars: round2(maxLossDollars),
        riskPerShare: round2(riskPerShare),
        assumptions,
    };
}

// =============================================================================
// Options Sizing
// =============================================================================

export function computeOptionSizing(input: OptionSizingInput): OptionSizingResult {
    const { riskMode, riskValue, strategy, contractMid, spreadWidth, netCredit, accountSize } = input;
    const assumptions: string[] = [];

    // Compute max loss per contract (× 100 shares/contract)
    let maxLossPerContract: number;

    switch (strategy) {
        case 'LONG_CALL':
        case 'LONG_PUT': {
            if (!contractMid || contractMid <= 0) {
                return {
                    suggestedContracts: 0,
                    maxLossDollars: 0,
                    assumptions: ['Contract mid-price required for long option sizing.'],
                };
            }
            maxLossPerContract = contractMid * 100;
            assumptions.push(`Max loss per contract: $${maxLossPerContract.toFixed(0)} (premium × 100)`);
            break;
        }

        case 'CREDIT_SPREAD': {
            if (!spreadWidth || spreadWidth <= 0) {
                return {
                    suggestedContracts: 0,
                    maxLossDollars: 0,
                    assumptions: ['Spread width required for credit spread sizing.'],
                };
            }
            const credit = netCredit ?? 0;
            maxLossPerContract = (spreadWidth - credit) * 100;
            assumptions.push(`Max loss per contract: $${maxLossPerContract.toFixed(0)} ((width: $${spreadWidth} - credit: $${credit.toFixed(2)}) × 100)`);
            break;
        }

        case 'DEBIT_SPREAD': {
            if (!contractMid || contractMid <= 0) {
                return {
                    suggestedContracts: 0,
                    maxLossDollars: 0,
                    assumptions: ['Net debit required for debit spread sizing.'],
                };
            }
            maxLossPerContract = contractMid * 100;
            assumptions.push(`Max loss per contract: $${maxLossPerContract.toFixed(0)} (net debit × 100)`);
            break;
        }

        default:
            return {
                suggestedContracts: 0,
                maxLossDollars: 0,
                assumptions: [`Unknown strategy: ${strategy}`],
            };
    }

    if (maxLossPerContract <= 0) {
        return {
            suggestedContracts: 0,
            maxLossDollars: 0,
            assumptions: ['Max loss per contract is zero or negative.'],
        };
    }

    let suggestedContracts: number;
    let maxRiskDollars: number;

    switch (riskMode) {
        case 'CONTRACTS': {
            suggestedContracts = Math.max(Math.round(riskValue), 0);
            assumptions.push(`Direct contract count: ${suggestedContracts}`);
            return {
                suggestedContracts,
                maxLossDollars: round2(suggestedContracts * maxLossPerContract),
                buyingPowerEstimate: computeBuyingPower(strategy, suggestedContracts, maxLossPerContract, contractMid, spreadWidth, netCredit),
                assumptions,
            };
        }

        case 'RISK_DOLLARS': {
            maxRiskDollars = riskValue;
            assumptions.push(`Max risk: $${maxRiskDollars.toFixed(2)}`);
            break;
        }

        case 'RISK_PERCENT': {
            if (!accountSize || accountSize <= 0) {
                return {
                    suggestedContracts: 0,
                    maxLossDollars: 0,
                    assumptions: ['Account size required for RISK_PERCENT mode.'],
                };
            }
            maxRiskDollars = (riskValue / 100) * accountSize;
            assumptions.push(`${riskValue}% of $${accountSize.toLocaleString()} = $${maxRiskDollars.toFixed(2)} max risk`);
            break;
        }

        default:
            return {
                suggestedContracts: 0,
                maxLossDollars: 0,
                assumptions: [`Unknown risk mode: ${riskMode}`],
            };
    }

    suggestedContracts = Math.max(Math.floor(maxRiskDollars / maxLossPerContract), 0);
    const totalMaxLoss = suggestedContracts * maxLossPerContract;

    assumptions.push(`Suggested contracts: ${suggestedContracts} (= $${maxRiskDollars.toFixed(2)} / $${maxLossPerContract.toFixed(0)})`);

    return {
        suggestedContracts,
        maxLossDollars: round2(totalMaxLoss),
        buyingPowerEstimate: computeBuyingPower(strategy, suggestedContracts, maxLossPerContract, contractMid, spreadWidth, netCredit),
        assumptions,
    };
}

// =============================================================================
// Helpers
// =============================================================================

function round2(n: number): number {
    return Math.round(n * 100) / 100;
}

function computeBuyingPower(
    strategy: string,
    contracts: number,
    maxLossPerContract: number,
    contractMid?: number,
    _spreadWidth?: number,
    _netCredit?: number,
): number | undefined {
    switch (strategy) {
        case 'LONG_CALL':
        case 'LONG_PUT':
            // Buying power = premium paid
            return contractMid ? round2(contractMid * 100 * contracts) : undefined;

        case 'DEBIT_SPREAD':
            // Buying power = net debit paid
            return contractMid ? round2(contractMid * 100 * contracts) : undefined;

        case 'CREDIT_SPREAD':
            // Buying power = max loss (width - credit) × 100 × contracts
            return round2(maxLossPerContract * contracts);

        default:
            return undefined;
    }
}
