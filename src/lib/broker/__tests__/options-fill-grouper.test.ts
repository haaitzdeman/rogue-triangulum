/**
 * Options Fill Grouper Tests
 */

import { groupOptionsFills } from '../options-fill-grouper';
import type { BrokerFill } from '../types';

// =============================================================================
// Helpers
// =============================================================================

function makeFill(overrides: Partial<BrokerFill> = {}): BrokerFill {
    return {
        tradeId: `fill-${Math.random().toString(36).slice(2, 8)}`,
        broker: 'alpaca',
        symbol: 'AAPL260321C00150000',
        side: 'buy',
        qty: 1,
        price: 5.00,
        filledAt: '2026-02-11T14:30:00Z',
        orderId: 'order-1',
        assetClass: 'option',
        underlyingSymbol: 'AAPL',
        strike: 150,
        expiration: '2026-03-21',
        callPut: 'call',
        ...overrides,
    };
}

// =============================================================================
// Tests
// =============================================================================

describe('groupOptionsFills', () => {
    it('returns empty array for stock-only fills', () => {
        const fills = [makeFill({ assetClass: 'stock' })];
        expect(groupOptionsFills(fills)).toEqual([]);
    });

    it('returns empty array for no fills', () => {
        expect(groupOptionsFills([])).toEqual([]);
    });

    it('groups single-leg fill as group of 1', () => {
        const fills = [makeFill({ tradeId: 'f1' })];
        const groups = groupOptionsFills(fills);
        expect(groups).toHaveLength(1);
        expect(groups[0].legs).toHaveLength(1);
        expect(groups[0].underlying).toBe('AAPL');
    });

    it('groups by orderId', () => {
        const fills = [
            makeFill({ tradeId: 'f1', orderId: 'ord-A', side: 'buy', price: 5.00, symbol: 'AAPL260321C00150000' }),
            makeFill({ tradeId: 'f2', orderId: 'ord-A', side: 'sell', price: 3.00, symbol: 'AAPL260321C00160000', strike: 160 }),
        ];
        const groups = groupOptionsFills(fills);
        expect(groups).toHaveLength(1);
        expect(groups[0].legs).toHaveLength(2);
        expect(groups[0].underlying).toBe('AAPL');
    });

    it('separates different orderIds', () => {
        const fills = [
            makeFill({ tradeId: 'f1', orderId: 'ord-A' }),
            makeFill({ tradeId: 'f2', orderId: 'ord-B' }),
        ];
        const groups = groupOptionsFills(fills);
        expect(groups).toHaveLength(2);
    });

    it('groups by timestamp proximity when no orderId', () => {
        const fills = [
            makeFill({ tradeId: 'f1', orderId: '', filledAt: '2026-02-11T14:30:00Z', underlyingSymbol: 'SPY' }),
            makeFill({ tradeId: 'f2', orderId: '', filledAt: '2026-02-11T14:30:03Z', underlyingSymbol: 'SPY', side: 'sell' }),
        ];
        const groups = groupOptionsFills(fills);
        expect(groups).toHaveLength(1);
        expect(groups[0].legs).toHaveLength(2);
    });

    it('does not group fills >5s apart without orderId', () => {
        const fills = [
            makeFill({ tradeId: 'f1', orderId: '', filledAt: '2026-02-11T14:30:00Z', underlyingSymbol: 'SPY' }),
            makeFill({ tradeId: 'f2', orderId: '', filledAt: '2026-02-11T14:30:10Z', underlyingSymbol: 'SPY' }),
        ];
        const groups = groupOptionsFills(fills);
        expect(groups).toHaveLength(2);
    });

    it('computes net cashflow correctly for debit spread', () => {
        // Buy call at $5, sell call at $3 → net debit = -$200
        const fills = [
            makeFill({ tradeId: 'f1', orderId: 'ord-A', side: 'buy', price: 5.00, qty: 1 }),
            makeFill({ tradeId: 'f2', orderId: 'ord-A', side: 'sell', price: 3.00, qty: 1 }),
        ];
        const groups = groupOptionsFills(fills);
        expect(groups).toHaveLength(1);
        expect(groups[0].direction).toBe('DEBIT');
        // buy = -$500, sell = +$300, net = -$200
        expect(groups[0].netCashflow).toBe(-200);
    });

    it('computes net cashflow correctly for credit spread', () => {
        // Sell put at $8, buy put at $3 → net credit = +$500
        const fills = [
            makeFill({ tradeId: 'f1', orderId: 'ord-A', side: 'sell', price: 8.00, qty: 1 }),
            makeFill({ tradeId: 'f2', orderId: 'ord-A', side: 'buy', price: 3.00, qty: 1 }),
        ];
        const groups = groupOptionsFills(fills);
        expect(groups[0].direction).toBe('CREDIT');
        expect(groups[0].netCashflow).toBe(500);
    });

    it('parses underlying from OCC symbol when no underlyingSymbol field', () => {
        const fills = [
            makeFill({
                tradeId: 'f1',
                underlyingSymbol: undefined,
                symbol: 'TSLA260415P00250000',
            }),
        ];
        const groups = groupOptionsFills(fills);
        expect(groups[0].underlying).toBe('TSLA');
    });

    it('sets is spread via leg count', () => {
        const single = groupOptionsFills([makeFill({ tradeId: 'f1', orderId: 'o1' })]);
        expect(single[0].legs).toHaveLength(1);

        const multi = groupOptionsFills([
            makeFill({ tradeId: 'f1', orderId: 'o1' }),
            makeFill({ tradeId: 'f2', orderId: 'o1', side: 'sell' }),
        ]);
        expect(multi[0].legs).toHaveLength(2);
    });
});
