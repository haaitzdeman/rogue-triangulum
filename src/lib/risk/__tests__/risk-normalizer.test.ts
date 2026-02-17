/**
 * Tests for computeRiskDollars — the pure risk normalizer
 */

import { computeRiskDollars } from '../risk-normalizer';

// ═══════════════════════════════════════════════════════════════════════
// RISK_DOLLARS mode (direct pass-through)
// ═══════════════════════════════════════════════════════════════════════

describe('computeRiskDollars — RISK_DOLLARS mode', () => {
    test('passes through risk_value directly (premarket)', () => {
        const result = computeRiskDollars({
            desk: 'PREMARKET',
            risk_mode: 'RISK_DOLLARS',
            risk_value: 200,
        });
        expect(result.riskDollars).toBe(200);
        expect(result.explanation).toHaveLength(1);
        expect(result.explanation[0]).toContain('RISK_DOLLARS');
    });

    test('passes through risk_value directly (options)', () => {
        const result = computeRiskDollars({
            desk: 'OPTIONS',
            risk_mode: 'RISK_DOLLARS',
            risk_value: 500,
        });
        expect(result.riskDollars).toBe(500);
    });

    test('returns null when risk_value is missing', () => {
        const result = computeRiskDollars({
            desk: 'PREMARKET',
            risk_mode: 'RISK_DOLLARS',
        });
        expect(result.riskDollars).toBeNull();
        expect(result.explanation[0]).toContain('missing');
    });

    test('returns null when risk_value is zero', () => {
        const result = computeRiskDollars({
            desk: 'PREMARKET',
            risk_mode: 'RISK_DOLLARS',
            risk_value: 0,
        });
        expect(result.riskDollars).toBeNull();
    });
});

// ═══════════════════════════════════════════════════════════════════════
// RISK_PERCENT mode
// ═══════════════════════════════════════════════════════════════════════

describe('computeRiskDollars — RISK_PERCENT mode', () => {
    test('computes account_size * risk_value/100', () => {
        const result = computeRiskDollars({
            desk: 'PREMARKET',
            risk_mode: 'RISK_PERCENT',
            risk_value: 2,
            account_size: 10000,
        });
        expect(result.riskDollars).toBe(200);
        expect(result.explanation[0]).toContain('10000');
        expect(result.explanation[0]).toContain('2%');
    });

    test('returns null when account_size missing', () => {
        const result = computeRiskDollars({
            desk: 'PREMARKET',
            risk_mode: 'RISK_PERCENT',
            risk_value: 2,
        });
        expect(result.riskDollars).toBeNull();
    });

    test('returns null when risk_value missing', () => {
        const result = computeRiskDollars({
            desk: 'OPTIONS',
            risk_mode: 'RISK_PERCENT',
            account_size: 10000,
        });
        expect(result.riskDollars).toBeNull();
    });
});

// ═══════════════════════════════════════════════════════════════════════
// SHARES mode (premarket only)
// ═══════════════════════════════════════════════════════════════════════

describe('computeRiskDollars — SHARES mode', () => {
    test('computes |entry - stop| * qty for LONG', () => {
        const result = computeRiskDollars({
            desk: 'PREMARKET',
            risk_mode: 'SHARES',
            entry_price: 50,
            stop_price: 48,
            total_qty: 100,
        });
        expect(result.riskDollars).toBe(200);
    });

    test('computes |entry - stop| * size when total_qty missing', () => {
        const result = computeRiskDollars({
            desk: 'PREMARKET',
            risk_mode: 'SHARES',
            entry_price: 100,
            stop_price: 97,
            size: 50,
        });
        expect(result.riskDollars).toBe(150);
    });

    test('returns null when stop_price missing', () => {
        const result = computeRiskDollars({
            desk: 'PREMARKET',
            risk_mode: 'SHARES',
            entry_price: 50,
            total_qty: 100,
        });
        expect(result.riskDollars).toBeNull();
    });

    test('returns null when entry equals stop', () => {
        const result = computeRiskDollars({
            desk: 'PREMARKET',
            risk_mode: 'SHARES',
            entry_price: 50,
            stop_price: 50,
            total_qty: 100,
        });
        expect(result.riskDollars).toBeNull();
    });

    test('ignored on OPTIONS desk (falls through to no-mode)', () => {
        const result = computeRiskDollars({
            desk: 'OPTIONS',
            risk_mode: 'SHARES',
            entry_price: 50,
            stop_price: 48,
            total_qty: 100,
        });
        expect(result.riskDollars).toBeNull();
        expect(result.explanation[0]).toContain('No recognized');
    });
});

// ═══════════════════════════════════════════════════════════════════════
// CONTRACTS mode (options only)
// ═══════════════════════════════════════════════════════════════════════

describe('computeRiskDollars — CONTRACTS mode (options)', () => {
    test('debit strategy: contracts * mid * 100', () => {
        const result = computeRiskDollars({
            desk: 'OPTIONS',
            risk_mode: 'CONTRACTS',
            contracts: 2,
            contract_mid: 3.50,
            strategy_type: 'LONG_CALL',
        });
        expect(result.riskDollars).toBe(700);
    });

    test('debit spread: contracts * mid * 100', () => {
        const result = computeRiskDollars({
            desk: 'OPTIONS',
            risk_mode: 'CONTRACTS',
            contracts: 1,
            contract_mid: 1.20,
            strategy_type: 'DEBIT_SPREAD',
        });
        expect(result.riskDollars).toBe(120);
    });

    test('credit spread with max_loss_per_contract', () => {
        const result = computeRiskDollars({
            desk: 'OPTIONS',
            risk_mode: 'CONTRACTS',
            contracts: 3,
            max_loss_per_contract: 2.00,
            strategy_type: 'CREDIT_SPREAD',
        });
        expect(result.riskDollars).toBe(600);
    });

    test('credit spread with spread_width and mid', () => {
        const result = computeRiskDollars({
            desk: 'OPTIONS',
            risk_mode: 'CONTRACTS',
            contracts: 2,
            spread_width: 5.00,
            contract_mid: 1.50,
            strategy_type: 'IRON_CONDOR',
        });
        // maxLoss = (5.00 - 1.50) * 100 * 2 = 700
        expect(result.riskDollars).toBe(700);
    });

    test('unknown strategy falls back to mid * 100', () => {
        const result = computeRiskDollars({
            desk: 'OPTIONS',
            risk_mode: 'CONTRACTS',
            contracts: 1,
            contract_mid: 2.00,
            strategy_type: 'CUSTOM_STRATEGY',
        });
        expect(result.riskDollars).toBe(200);
    });

    test('returns null when contracts missing', () => {
        const result = computeRiskDollars({
            desk: 'OPTIONS',
            risk_mode: 'CONTRACTS',
            contract_mid: 2.00,
            strategy_type: 'LONG_CALL',
        });
        expect(result.riskDollars).toBeNull();
    });

    test('ignored on PREMARKET desk (falls through to no-mode)', () => {
        const result = computeRiskDollars({
            desk: 'PREMARKET',
            risk_mode: 'CONTRACTS',
            contracts: 2,
            contract_mid: 3.50,
            strategy_type: 'LONG_CALL',
        });
        expect(result.riskDollars).toBeNull();
    });
});

// ═══════════════════════════════════════════════════════════════════════
// No mode / empty / unknown
// ═══════════════════════════════════════════════════════════════════════

describe('computeRiskDollars — edge cases', () => {
    test('no risk_mode returns null', () => {
        const result = computeRiskDollars({
            desk: 'PREMARKET',
        });
        expect(result.riskDollars).toBeNull();
        expect(result.explanation[0]).toContain('No recognized');
    });

    test('null risk_mode returns null', () => {
        const result = computeRiskDollars({
            desk: 'OPTIONS',
            risk_mode: null,
        });
        expect(result.riskDollars).toBeNull();
    });

    test('unknown risk_mode returns null', () => {
        const result = computeRiskDollars({
            desk: 'PREMARKET',
            risk_mode: 'MAGIC',
        });
        expect(result.riskDollars).toBeNull();
    });

    test('case insensitive mode matching', () => {
        const result = computeRiskDollars({
            desk: 'PREMARKET',
            risk_mode: 'risk_dollars',
            risk_value: 100,
        });
        expect(result.riskDollars).toBe(100);
    });
});
