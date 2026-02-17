/**
 * Signal Utils Tests
 * 
 * Tests for deterministic signal ID generation and PnL calculations.
 */

import {
    generateSignalId,
    calculateOutcome,
    extractRiskPerShare,
    validateOutcomeUpdate,
    ALLOWED_OUTCOME_FIELDS,
} from '../signal-utils';

describe('generateSignalId', () => {
    it('generates deterministic ID for same inputs', () => {
        const date = '2026-01-30';
        const symbol = 'AAPL';
        const gapPct = 5.25;
        const config = { minGapPct: 3, minPrice: 5 };

        const id1 = generateSignalId(date, symbol, gapPct, config);
        const id2 = generateSignalId(date, symbol, gapPct, config);

        expect(id1).toBe(id2);
        expect(id1).toHaveLength(16);
    });

    it('generates different ID for different symbols', () => {
        const date = '2026-01-30';
        const gapPct = 5.25;
        const config = { minGapPct: 3 };

        const id1 = generateSignalId(date, 'AAPL', gapPct, config);
        const id2 = generateSignalId(date, 'TSLA', gapPct, config);

        expect(id1).not.toBe(id2);
    });

    it('generates different ID for different dates', () => {
        const symbol = 'AAPL';
        const gapPct = 5.25;
        const config = { minGapPct: 3 };

        const id1 = generateSignalId('2026-01-30', symbol, gapPct, config);
        const id2 = generateSignalId('2026-01-31', symbol, gapPct, config);

        expect(id1).not.toBe(id2);
    });

    it('generates different ID for different gapPct', () => {
        const date = '2026-01-30';
        const symbol = 'AAPL';
        const config = { minGapPct: 3 };

        const id1 = generateSignalId(date, symbol, 5.25, config);
        const id2 = generateSignalId(date, symbol, 5.26, config);

        expect(id1).not.toBe(id2);
    });

    it('generates different ID for different config', () => {
        const date = '2026-01-30';
        const symbol = 'AAPL';
        const gapPct = 5.25;

        const id1 = generateSignalId(date, symbol, gapPct, { minGapPct: 3 });
        const id2 = generateSignalId(date, symbol, gapPct, { minGapPct: 5 });

        expect(id1).not.toBe(id2);
    });

    it('normalizes symbol case', () => {
        const date = '2026-01-30';
        const gapPct = 5.25;
        const config = { minGapPct: 3 };

        const id1 = generateSignalId(date, 'aapl', gapPct, config);
        const id2 = generateSignalId(date, 'AAPL', gapPct, config);

        expect(id1).toBe(id2);
    });

    it('handles config key order consistently', () => {
        const date = '2026-01-30';
        const symbol = 'AAPL';
        const gapPct = 5.25;

        const id1 = generateSignalId(date, symbol, gapPct, { a: 1, b: 2 });
        const id2 = generateSignalId(date, symbol, gapPct, { b: 2, a: 1 });

        expect(id1).toBe(id2);
    });
});

describe('calculateOutcome', () => {
    describe('LONG trades', () => {
        it('calculates winning trade correctly', () => {
            const result = calculateOutcome({
                direction: 'LONG',
                entryPrice: 100,
                exitPrice: 110,
                size: 10,
            });

            expect(result).not.toBeNull();
            expect(result!.pnlDollars).toBe(100); // (110-100)*10
            expect(result!.pnlPercent).toBe(10);  // 10% gain
            expect(result!.result).toBe('WIN');
        });

        it('calculates losing trade correctly', () => {
            const result = calculateOutcome({
                direction: 'LONG',
                entryPrice: 100,
                exitPrice: 90,
                size: 10,
            });

            expect(result).not.toBeNull();
            expect(result!.pnlDollars).toBe(-100); // (90-100)*10
            expect(result!.pnlPercent).toBe(-10);  // 10% loss
            expect(result!.result).toBe('LOSS');
        });

        it('returns PENDING when no exit price', () => {
            const result = calculateOutcome({
                direction: 'LONG',
                entryPrice: 100,
                size: 10,
            });

            expect(result).not.toBeNull();
            expect(result!.result).toBe('PENDING');
            expect(result!.pnlDollars).toBe(0);
        });

        it('calculates R-multiple with risk', () => {
            const result = calculateOutcome(
                { direction: 'LONG', entryPrice: 100, exitPrice: 105, size: 10 },
                2.5  // risk per share
            );

            expect(result).not.toBeNull();
            expect(result!.pnlDollars).toBe(50);
            expect(result!.rMultiple).toBe(2);  // 5/2.5 = 2R
        });
    });

    describe('SHORT trades', () => {
        it('calculates winning trade correctly', () => {
            const result = calculateOutcome({
                direction: 'SHORT',
                entryPrice: 100,
                exitPrice: 90,
                size: 10,
            });

            expect(result).not.toBeNull();
            expect(result!.pnlDollars).toBe(100); // (100-90)*10
            expect(result!.pnlPercent).toBe(10);
            expect(result!.result).toBe('WIN');
        });

        it('calculates losing trade correctly', () => {
            const result = calculateOutcome({
                direction: 'SHORT',
                entryPrice: 100,
                exitPrice: 110,
                size: 10,
            });

            expect(result).not.toBeNull();
            expect(result!.pnlDollars).toBe(-100); // (100-110)*10
            expect(result!.pnlPercent).toBe(-10);
            expect(result!.result).toBe('LOSS');
        });
    });

    describe('edge cases', () => {
        it('handles breakeven trade', () => {
            const result = calculateOutcome({
                direction: 'LONG',
                entryPrice: 100,
                exitPrice: 100,
                size: 10,
            });

            expect(result).not.toBeNull();
            expect(result!.result).toBe('BREAKEVEN');
            expect(result!.pnlDollars).toBe(0);
        });

        it('handles decimal prices correctly', () => {
            const result = calculateOutcome({
                direction: 'LONG',
                entryPrice: 45.67,
                exitPrice: 48.90,
                size: 100,
            });

            expect(result).not.toBeNull();
            expect(result!.pnlDollars).toBe(323); // (48.90-45.67)*100
        });
    });
});

describe('extractRiskPerShare', () => {
    it('extracts risk for LONG position', () => {
        const risk = extractRiskPerShare(
            { stopLoss: 95 },
            100,
            'LONG'
        );

        expect(risk).toBe(5);
    });

    it('extracts risk for SHORT position', () => {
        const risk = extractRiskPerShare(
            { stopLoss: 105 },
            100,
            'SHORT'
        );

        expect(risk).toBe(5);
    });

    it('returns undefined when no stopLoss', () => {
        const risk = extractRiskPerShare({}, 100, 'LONG');
        expect(risk).toBeUndefined();
    });
});

describe('validateOutcomeUpdate', () => {
    it('allows all valid fields', () => {
        const result = validateOutcomeUpdate({
            status: 'CLOSED',
            user_note: 'test',
            trade_direction: 'LONG',
            entry_price: 100,
            exit_price: 110,
            size: 10,
            outcome: { pnlDollars: 100 },
        });

        expect(result.valid).toBe(true);
        expect(result.disallowedFields).toHaveLength(0);
    });

    it('rejects signal fields', () => {
        const result = validateOutcomeUpdate({
            status: 'CLOSED',
            symbol: 'AAPL',  // Signal field - not allowed
        });

        expect(result.valid).toBe(false);
        expect(result.disallowedFields).toContain('symbol');
    });

    it('rejects multiple disallowed fields', () => {
        const result = validateOutcomeUpdate({
            status: 'CLOSED',
            symbol: 'AAPL',
            gap_pct: 5,
            because: 'test',
        });

        expect(result.valid).toBe(false);
        expect(result.disallowedFields).toContain('symbol');
        expect(result.disallowedFields).toContain('gap_pct');
        expect(result.disallowedFields).toContain('because');
    });

    it('exports ALLOWED_OUTCOME_FIELDS constant', () => {
        expect(ALLOWED_OUTCOME_FIELDS).toContain('trade_direction');
        expect(ALLOWED_OUTCOME_FIELDS).toContain('entry_price');
        expect(ALLOWED_OUTCOME_FIELDS).toContain('exit_price');
        expect(ALLOWED_OUTCOME_FIELDS).toContain('outcome');
        expect(ALLOWED_OUTCOME_FIELDS).toContain('status');
        expect(ALLOWED_OUTCOME_FIELDS).not.toContain('symbol');
    });
});
