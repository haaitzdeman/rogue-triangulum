/**
 * Risk Normalizer — Compute risk_dollars from any sizing mode
 *
 * Pure function. No DB access.
 * Used by journal routes to compute + persist `risk_dollars` before saving.
 */

export type RiskMode = 'CONTRACTS' | 'RISK_DOLLARS' | 'RISK_PERCENT' | 'SHARES';
export type Desk = 'PREMARKET' | 'OPTIONS';

export interface RiskNormalizerParams {
    desk: Desk;
    risk_mode?: RiskMode | string | null;
    risk_value?: number | null;
    account_size?: number | null;
    is_draft?: boolean;

    // Premarket (stocks)
    entry_price?: number | null;
    stop_price?: number | null;
    total_qty?: number | null;
    size?: number | null;

    // Options
    contract_mid?: number | null;        // mid price of selected contract
    contracts?: number | null;           // number of contracts
    strategy_type?: string | null;       // e.g. LONG_CALL, DEBIT_SPREAD, CREDIT_SPREAD
    spread_width?: number | null;        // width between strikes (for credit spreads)
    max_loss_per_contract?: number | null;
}

export interface RiskNormalizerResult {
    riskDollars: number | null;
    explanation: string[];
}

/**
 * Compute `risk_dollars` from the available sizing inputs.
 *
 * Returns `{ riskDollars, explanation }` where explanation logs the rule used.
 * Returns `null` with explanation when required fields are missing.
 */
export function computeRiskDollars(params: RiskNormalizerParams): RiskNormalizerResult {
    const mode = (params.risk_mode || '').toUpperCase() as RiskMode;
    const explanation: string[] = [];

    // ── RISK_DOLLARS: direct pass-through ────────────────────────────────
    if (mode === 'RISK_DOLLARS') {
        if (params.risk_value != null && params.risk_value > 0) {
            explanation.push(`RISK_DOLLARS mode: risk_value=${params.risk_value}`);
            return { riskDollars: params.risk_value, explanation };
        }
        explanation.push('RISK_DOLLARS mode but risk_value is missing or zero');
        return { riskDollars: null, explanation };
    }

    // ── RISK_PERCENT: account_size * (risk_value / 100) ──────────────────
    if (mode === 'RISK_PERCENT') {
        if (params.account_size != null && params.account_size > 0 &&
            params.risk_value != null && params.risk_value > 0) {
            const riskDollars = params.account_size * (params.risk_value / 100);
            explanation.push(
                `RISK_PERCENT mode: ${params.account_size} × ${params.risk_value}% = ${riskDollars.toFixed(2)}`,
            );
            return { riskDollars, explanation };
        }
        explanation.push(
            `RISK_PERCENT mode but missing fields: account_size=${params.account_size}, risk_value=${params.risk_value}`,
        );
        return { riskDollars: null, explanation };
    }

    // ── SHARES (premarket only): abs(entry - stop) * qty ─────────────────
    if (mode === 'SHARES' && params.desk === 'PREMARKET') {
        const qty = params.total_qty ?? params.size ?? null;
        if (params.entry_price != null && params.stop_price != null && qty != null &&
            params.entry_price > 0 && qty > 0) {
            const riskPerShare = Math.abs(params.entry_price - params.stop_price);
            if (riskPerShare > 0) {
                const riskDollars = riskPerShare * qty;
                explanation.push(
                    `SHARES mode: |${params.entry_price} − ${params.stop_price}| × ${qty} = ${riskDollars.toFixed(2)}`,
                );
                return { riskDollars, explanation };
            }
            explanation.push('SHARES mode: entry_price equals stop_price → zero risk per share');
            return { riskDollars: null, explanation };
        }
        explanation.push(
            `SHARES mode but missing fields: entry=${params.entry_price}, stop=${params.stop_price}, qty=${qty}`,
        );
        return { riskDollars: null, explanation };
    }

    // ── CONTRACTS (options only): depends on strategy type ───────────────
    if (mode === 'CONTRACTS' && params.desk === 'OPTIONS') {
        const contracts = params.contracts ?? params.risk_value ?? null;
        const strategyUpper = (params.strategy_type || '').toUpperCase();

        // Debit strategies: max loss = contracts * mid * 100
        const isDebit = ['LONG_CALL', 'LONG_PUT', 'DEBIT_SPREAD'].some(s =>
            strategyUpper.includes(s),
        );

        if (isDebit) {
            if (contracts != null && contracts > 0 && params.contract_mid != null && params.contract_mid > 0) {
                const riskDollars = contracts * params.contract_mid * 100;
                explanation.push(
                    `CONTRACTS+${strategyUpper}: ${contracts} × $${params.contract_mid} × 100 = $${riskDollars.toFixed(2)}`,
                );
                return { riskDollars, explanation };
            }
            explanation.push(
                `CONTRACTS+${strategyUpper}: missing contracts(${contracts}) or mid(${params.contract_mid})`,
            );
            return { riskDollars: null, explanation };
        }

        // Credit strategies: need spreadWidth or maxLossPerContract
        const isCredit = strategyUpper.includes('CREDIT_SPREAD') || strategyUpper.includes('IRON_CONDOR');
        if (isCredit) {
            if (params.max_loss_per_contract != null && contracts != null && contracts > 0) {
                const riskDollars = contracts * params.max_loss_per_contract * 100;
                explanation.push(
                    `CONTRACTS+${strategyUpper}: ${contracts} × maxLoss $${params.max_loss_per_contract} × 100 = $${riskDollars.toFixed(2)}`,
                );
                return { riskDollars, explanation };
            }
            if (params.spread_width != null && params.contract_mid != null && contracts != null && contracts > 0) {
                const maxLossPerContract = params.spread_width - params.contract_mid;
                if (maxLossPerContract > 0) {
                    const riskDollars = contracts * maxLossPerContract * 100;
                    explanation.push(
                        `CONTRACTS+${strategyUpper}: ${contracts} × (${params.spread_width} − ${params.contract_mid}) × 100 = $${riskDollars.toFixed(2)}`,
                    );
                    return { riskDollars, explanation };
                }
            }
            explanation.push(
                `CONTRACTS+${strategyUpper}: missing spreadWidth/maxLossPerContract or contracts`,
            );
            return { riskDollars: null, explanation };
        }

        // Unknown strategy under CONTRACTS mode
        if (contracts != null && contracts > 0 && params.contract_mid != null && params.contract_mid > 0) {
            const riskDollars = contracts * params.contract_mid * 100;
            explanation.push(
                `CONTRACTS+UNKNOWN(${strategyUpper}): fallback ${contracts} × $${params.contract_mid} × 100 = $${riskDollars.toFixed(2)}`,
            );
            return { riskDollars, explanation };
        }
        explanation.push(`CONTRACTS mode but cannot compute: strategy=${strategyUpper}, contracts=${contracts}, mid=${params.contract_mid}`);
        return { riskDollars: null, explanation };
    }

    // ── No mode / unknown mode ───────────────────────────────────────────
    explanation.push(`No recognized risk_mode: "${params.risk_mode}" for desk ${params.desk}`);
    return { riskDollars: null, explanation };
}
