/**
 * Position Sizing Library — Unit Tests (Jest)
 *
 * Covers all risk modes, edge cases, and SHORT direction.
 */

import {
    computeStockSizing,
    computeOptionSizing,
} from '@/lib/shared/sizing';

// =============================================================================
// Stock Sizing
// =============================================================================

describe('computeStockSizing', () => {
    test('CONTRACTS mode returns exact share count', () => {
        const result = computeStockSizing({
            riskMode: 'CONTRACTS',
            riskValue: 100,
            entryPrice: 50,
            stopPrice: 48,
        });
        expect(result.suggestedShares).toBe(100);
        expect(result.riskPerShare).toBe(2);
        expect(result.maxLossDollars).toBe(200);
    });

    test('RISK_DOLLARS mode computes shares from fixed dollar risk', () => {
        const result = computeStockSizing({
            riskMode: 'RISK_DOLLARS',
            riskValue: 200,
            entryPrice: 50,
            stopPrice: 48,
        });
        // $200 risk / $2 risk-per-share = 100 shares
        expect(result.suggestedShares).toBe(100);
        expect(result.riskPerShare).toBe(2);
        expect(result.maxLossDollars).toBe(200);
    });

    test('RISK_DOLLARS mode floors shares to whole number', () => {
        const result = computeStockSizing({
            riskMode: 'RISK_DOLLARS',
            riskValue: 150,
            entryPrice: 50,
            stopPrice: 48,
        });
        // $150 / $2 = 75 shares
        expect(result.suggestedShares).toBe(75);
        expect(result.maxLossDollars).toBe(150);
    });

    test('RISK_PERCENT mode computes from account size', () => {
        const result = computeStockSizing({
            riskMode: 'RISK_PERCENT',
            riskValue: 1, // 1% of account
            entryPrice: 100,
            stopPrice: 95,
            accountSize: 50000,
        });
        // 1% of $50k = $500 risk. $500 / $5 risk/share = 100 shares
        expect(result.suggestedShares).toBe(100);
        expect(result.riskPerShare).toBe(5);
        expect(result.maxLossDollars).toBe(500);
    });

    test('RISK_PERCENT returns 0 shares when no account size', () => {
        const result = computeStockSizing({
            riskMode: 'RISK_PERCENT',
            riskValue: 1,
            entryPrice: 100,
            stopPrice: 95,
        });
        expect(result.suggestedShares).toBe(0);
        expect(result.assumptions).toContain('Account size required for RISK_PERCENT mode.');
    });

    test('returns 0 when entry equals stop', () => {
        const result = computeStockSizing({
            riskMode: 'RISK_DOLLARS',
            riskValue: 500,
            entryPrice: 50,
            stopPrice: 50,
        });
        expect(result.suggestedShares).toBe(0);
        expect(result.riskPerShare).toBe(0);
    });

    test('handles SHORT direction (stop above entry)', () => {
        const result = computeStockSizing({
            riskMode: 'RISK_DOLLARS',
            riskValue: 300,
            entryPrice: 50,
            stopPrice: 53, // stop above entry for short
        });
        // Risk per share = |50-53| = $3. $300/$3 = 100 shares
        expect(result.suggestedShares).toBe(100);
        expect(result.riskPerShare).toBe(3);
    });
});

// =============================================================================
// Options Sizing
// =============================================================================

describe('computeOptionSizing', () => {
    test('CONTRACTS mode returns exact count with max loss', () => {
        const result = computeOptionSizing({
            riskMode: 'CONTRACTS',
            riskValue: 5,
            strategy: 'LONG_CALL',
            contractMid: 2.50,
        });
        expect(result.suggestedContracts).toBe(5);
        // Max loss = 5 × $2.50 × 100 = $1250
        expect(result.maxLossDollars).toBe(1250);
    });

    test('RISK_DOLLARS mode computes contracts for long call', () => {
        const result = computeOptionSizing({
            riskMode: 'RISK_DOLLARS',
            riskValue: 500,
            strategy: 'LONG_CALL',
            contractMid: 2.50,
        });
        // $500 / ($2.50 × 100) = 2 contracts
        expect(result.suggestedContracts).toBe(2);
        expect(result.maxLossDollars).toBe(500);
    });

    test('RISK_PERCENT mode for credit spread', () => {
        const result = computeOptionSizing({
            riskMode: 'RISK_PERCENT',
            riskValue: 2, // 2% of account
            strategy: 'CREDIT_SPREAD',
            spreadWidth: 5,
            netCredit: 1.50,
            accountSize: 25000,
        });
        // 2% of $25k = $500. Max loss per contract = ($5 - $1.50) × 100 = $350
        // $500 / $350 = 1 contract (floored)
        expect(result.suggestedContracts).toBe(1);
        expect(result.maxLossDollars).toBe(350);
    });

    test('debit spread sizing uses net debit as max loss', () => {
        const result = computeOptionSizing({
            riskMode: 'RISK_DOLLARS',
            riskValue: 1000,
            strategy: 'DEBIT_SPREAD',
            contractMid: 1.80, // net debit
        });
        // Max loss per contract = $1.80 × 100 = $180
        // $1000 / $180 = 5 contracts
        expect(result.suggestedContracts).toBe(5);
        expect(result.maxLossDollars).toBe(900);
    });

    test('returns 0 when missing required fields', () => {
        const result = computeOptionSizing({
            riskMode: 'RISK_DOLLARS',
            riskValue: 500,
            strategy: 'LONG_PUT',
            // missing contractMid
        });
        expect(result.suggestedContracts).toBe(0);
        expect(result.assumptions).toContain('Contract mid-price required for long option sizing.');
    });

    test('buying power estimate for long call', () => {
        const result = computeOptionSizing({
            riskMode: 'CONTRACTS',
            riskValue: 3,
            strategy: 'LONG_CALL',
            contractMid: 4.00,
        });
        // Buying power = $4.00 × 100 × 3 = $1200
        expect(result.buyingPowerEstimate).toBe(1200);
    });
});
