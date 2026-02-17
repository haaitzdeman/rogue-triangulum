/**
 * Contract Selector — Unit Tests (Jest)
 *
 * Covers ATM selection, spreads, DTE window, determinism, width-by-price tier.
 */

import { selectContract } from '@/lib/options/contract-selector';
import type { OptionContract } from '@/lib/options/options-types';

// =============================================================================
// Test Fixtures
// =============================================================================

function makeContract(overrides: Partial<OptionContract> & { strike: number; type: 'CALL' | 'PUT' }): OptionContract {
    const { strike, type, ...rest } = overrides;
    const base: OptionContract = {
        symbol: `O:TEST250221${type === 'CALL' ? 'C' : 'P'}${String(strike * 1000).padStart(8, '0')}`,
        type,
        strike,
        expiration: '2025-02-21',
        daysToExpiration: 14,
        bid: 1.00,
        ask: 1.20,
        mid: 1.10,
        volume: 500,
        openInterest: 2000,
        impliedVolatility: 0.35,
        bidAskSpreadPct: 16.67,
        ...rest,
    };
    return base;
}

function buildChain(underlyingPrice: number): OptionContract[] {
    const strikes = [-10, -5, -2, -1, 0, 1, 2, 5, 10].map(offset =>
        Math.round(underlyingPrice + offset)
    );
    const contracts: OptionContract[] = [];
    for (const strike of strikes) {
        contracts.push(makeContract({ strike, type: 'CALL' }));
        contracts.push(makeContract({ strike, type: 'PUT' }));
    }
    return contracts;
}

// =============================================================================
// Tests
// =============================================================================

describe('selectContract', () => {
    const price = 150;
    const chain = buildChain(price);

    describe('AVOID strategy', () => {
        test('returns null', () => {
            expect(selectContract('AVOID', chain, price)).toBeNull();
        });
    });

    describe('empty contracts', () => {
        test('returns null', () => {
            expect(selectContract('LONG_CALL', [], price)).toBeNull();
        });
    });

    describe('LONG_CALL', () => {
        test('selects nearest ATM call', () => {
            const result = selectContract('LONG_CALL', chain, price);
            expect(result).not.toBeNull();
            expect(result!.strategy).toBe('LONG_CALL');
            expect(result!.contract).toBeDefined();
            expect(result!.contract!.type).toBe('call');
            // Should be nearest ATM — strike 150
            expect(result!.contract!.strike).toBe(150);
        });

        test('has DTE target range', () => {
            const result = selectContract('LONG_CALL', chain, price);
            expect(result!.dteTarget.min).toBe(7);
            expect(result!.dteTarget.max).toBe(21);
            expect(result!.dteTarget.selected).toBe(14);
        });

        test('generates entry plan', () => {
            const result = selectContract('LONG_CALL', chain, price);
            expect(result!.entryPlan).toContain('call');
            expect(result!.entryPlan.length).toBeGreaterThan(10);
        });

        test('generates invalidation', () => {
            const result = selectContract('LONG_CALL', chain, price);
            expect(result!.invalidation).toContain('below');
        });

        test('generates risk notes', () => {
            const result = selectContract('LONG_CALL', chain, price);
            expect(result!.riskNotes.length).toBeGreaterThan(0);
        });
    });

    describe('LONG_PUT', () => {
        test('selects nearest ATM put', () => {
            const result = selectContract('LONG_PUT', chain, price);
            expect(result).not.toBeNull();
            expect(result!.strategy).toBe('LONG_PUT');
            expect(result!.contract!.type).toBe('put');
            expect(result!.contract!.strike).toBe(150);
        });

        test('invalidation mentions above', () => {
            const result = selectContract('LONG_PUT', chain, price);
            expect(result!.invalidation).toContain('above');
        });
    });

    describe('DEBIT_SPREAD', () => {
        test('selects ATM buy + OTM sell for bullish', () => {
            const result = selectContract('DEBIT_SPREAD', chain, price, 2.0); // bullish
            expect(result).not.toBeNull();
            expect(result!.strategy).toBe('DEBIT_SPREAD');
            expect(result!.spreadLegs).toBeDefined();
            // Buy near ATM, sell further OTM
            expect(result!.spreadLegs!.long.strike).toBeLessThanOrEqual(result!.spreadLegs!.short.strike);
        });

        test('computes net debit', () => {
            const result = selectContract('DEBIT_SPREAD', chain, price, 2.0);
            expect(result!.spreadLegs!.netDebit).toBeDefined();
        });
    });

    describe('CREDIT_SPREAD', () => {
        test('selects OTM short + further OTM long', () => {
            const result = selectContract('CREDIT_SPREAD', chain, price, -2.0); // bearish
            expect(result).not.toBeNull();
            expect(result!.strategy).toBe('CREDIT_SPREAD');
            expect(result!.spreadLegs).toBeDefined();
        });

        test('has max loss', () => {
            const result = selectContract('CREDIT_SPREAD', chain, price);
            if (result) {
                expect(result.spreadLegs!.maxLoss).toBeDefined();
                expect(result.spreadLegs!.maxLoss!).toBeGreaterThan(0);
            }
        });

        test('has breakeven', () => {
            const result = selectContract('CREDIT_SPREAD', chain, price);
            if (result) {
                expect(result.spreadLegs!.breakeven).toBeDefined();
            }
        });
    });

    describe('determinism', () => {
        test('same inputs produce same output', () => {
            const r1 = selectContract('LONG_CALL', chain, price, 1.5);
            const r2 = selectContract('LONG_CALL', chain, price, 1.5);
            expect(JSON.stringify(r1)).toBe(JSON.stringify(r2));
        });
    });

    describe('spread width', () => {
        test('uses $1 width for underlying < $50', () => {
            const cheapChain = buildChain(30);
            const result = selectContract('DEBIT_SPREAD', cheapChain, 30, 1.0);
            if (result?.spreadLegs) {
                const width = Math.abs(result.spreadLegs.long.strike - result.spreadLegs.short.strike);
                expect(width).toBe(1);
            }
        });

        test('uses $5 width for underlying > $200', () => {
            const expensiveChain = buildChain(300);
            const result = selectContract('DEBIT_SPREAD', expensiveChain, 300, 1.0);
            if (result?.spreadLegs) {
                const width = Math.abs(result.spreadLegs.long.strike - result.spreadLegs.short.strike);
                expect(width).toBe(5);
            }
        });
    });
});
