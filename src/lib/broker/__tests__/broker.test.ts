/**
 * Broker Module Tests
 *
 * Tests for:
 * - Alpaca activity → BrokerFill mapping
 * - OCC option symbol parsing
 * - Dedup upsert behavior (mock supabase)
 * - Sync endpoint logic
 */

import { mapActivityToFill, parseOccSymbol, isOptionSymbol } from '../alpaca-mapper';
import type { AlpacaActivity, BrokerFill } from '../types';

// =============================================================================
// Mapper Tests
// =============================================================================

describe('alpaca-mapper', () => {
    describe('mapActivityToFill', () => {
        const validActivity: AlpacaActivity = {
            id: '20260208120000::aapl::fill',
            activity_type: 'FILL',
            symbol: 'AAPL',
            side: 'buy',
            qty: '10',
            price: '185.50',
            transaction_time: '2026-02-08T12:00:00Z',
            order_id: 'order-123',
        };

        it('maps a valid stock activity to BrokerFill', () => {
            const fill = mapActivityToFill(validActivity);
            expect(fill).not.toBeNull();
            expect(fill!.broker).toBe('alpaca');
            expect(fill!.symbol).toBe('AAPL');
            expect(fill!.side).toBe('buy');
            expect(fill!.qty).toBe(10);
            expect(fill!.price).toBe(185.5);
            expect(fill!.filledAt).toBe('2026-02-08T12:00:00Z');
            expect(fill!.assetClass).toBe('stock');
            expect(fill!.orderId).toBe('order-123');
            expect(fill!.tradeId).toBe('20260208120000::aapl::fill');
        });

        it('maps a sell activity correctly', () => {
            const fill = mapActivityToFill({ ...validActivity, side: 'sell' });
            expect(fill!.side).toBe('sell');
        });

        it('returns null for missing id', () => {
            const fill = mapActivityToFill({ ...validActivity, id: '' });
            expect(fill).toBeNull();
        });

        it('returns null for missing symbol', () => {
            const fill = mapActivityToFill({ ...validActivity, symbol: '' });
            expect(fill).toBeNull();
        });

        it('returns null for missing order_id', () => {
            const fill = mapActivityToFill({ ...validActivity, order_id: '' });
            expect(fill).toBeNull();
        });

        it('returns null for invalid qty', () => {
            const fill = mapActivityToFill({ ...validActivity, qty: 'abc' });
            expect(fill).toBeNull();
        });

        it('returns null for zero qty', () => {
            const fill = mapActivityToFill({ ...validActivity, qty: '0' });
            expect(fill).toBeNull();
        });

        it('returns null for invalid price', () => {
            const fill = mapActivityToFill({ ...validActivity, price: 'NaN' });
            expect(fill).toBeNull();
        });

        it('returns null for missing transaction_time', () => {
            const fill = mapActivityToFill({ ...validActivity, transaction_time: '' });
            expect(fill).toBeNull();
        });

        it('returns null for invalid side', () => {
            const fill = mapActivityToFill({ ...validActivity, side: 'hold' });
            expect(fill).toBeNull();
        });

        it('maps an OCC option symbol correctly', () => {
            const optionActivity: AlpacaActivity = {
                ...validActivity,
                symbol: 'AAPL  260220C00150000',
            };
            const fill = mapActivityToFill(optionActivity);
            expect(fill).not.toBeNull();
            expect(fill!.assetClass).toBe('option');
            expect(fill!.symbol).toBe('AAPL');
            expect(fill!.underlyingSymbol).toBe('AAPL');
            expect(fill!.expiration).toBe('2026-02-20');
            expect(fill!.strike).toBe(150);
            expect(fill!.callPut).toBe('call');
        });
    });

    describe('parseOccSymbol', () => {
        it('parses a standard call option', () => {
            const result = parseOccSymbol('AAPL  260220C00150000');
            expect(result).toEqual({
                underlyingSymbol: 'AAPL',
                expiration: '2026-02-20',
                callPut: 'call',
                strike: 150,
            });
        });

        it('parses a standard put option', () => {
            const result = parseOccSymbol('TSLA  261115P00250000');
            expect(result).toEqual({
                underlyingSymbol: 'TSLA',
                expiration: '2026-11-15',
                callPut: 'put',
                strike: 250,
            });
        });

        it('parses fractional strike', () => {
            const result = parseOccSymbol('SPY   260320C00425500');
            expect(result).toEqual({
                underlyingSymbol: 'SPY',
                expiration: '2026-03-20',
                callPut: 'call',
                strike: 425.5,
            });
        });

        it('returns null for regular stock symbol', () => {
            expect(parseOccSymbol('AAPL')).toBeNull();
        });

        it('returns null for short string', () => {
            expect(parseOccSymbol('AB')).toBeNull();
        });

        it('returns null for empty string', () => {
            expect(parseOccSymbol('')).toBeNull();
        });
    });

    describe('isOptionSymbol', () => {
        it('returns true for OCC symbol', () => {
            expect(isOptionSymbol('AAPL  260220C00150000')).toBe(true);
        });

        it('returns false for stock symbol', () => {
            expect(isOptionSymbol('AAPL')).toBe(false);
        });
    });
});

// =============================================================================
// Dedup Tests (mock supabase)
// =============================================================================

// Mock supabase before importing fill-store
jest.mock('@/lib/supabase/client', () => {
    const mockSelect = jest.fn().mockResolvedValue({ data: [{ id: 'uuid-1' }], error: null });
    const mockUpsert = jest.fn().mockReturnValue({ select: mockSelect });
    const mockOrder = jest.fn().mockResolvedValue({ data: [], error: null });
    const mockFrom = jest.fn().mockReturnValue({
        upsert: mockUpsert,
        select: jest.fn().mockReturnValue({
            order: mockOrder,
            gte: jest.fn().mockReturnThis(),
            lte: jest.fn().mockReturnThis(),
            eq: jest.fn().mockReturnThis(),
        }),
    });

    return {
        supabase: {
            from: mockFrom,
        },
    };
});

describe('fill-store', () => {
    // Import after mocks are set up
    let upsertFills: typeof import('../fill-store').upsertFills;

    beforeAll(async () => {
        const mod = await import('../fill-store');
        upsertFills = mod.upsertFills;
    });

    it('returns 0/0 for empty array', async () => {
        const result = await upsertFills([]);
        expect(result).toEqual({ inserted: 0, skipped: 0 });
    });

    it('counts inserted fills from upsert response', async () => {
        const fills: BrokerFill[] = [
            {
                broker: 'alpaca',
                symbol: 'AAPL',
                side: 'buy',
                qty: 10,
                price: 185.5,
                filledAt: '2026-02-08T12:00:00Z',
                assetClass: 'stock',
                orderId: 'order-1',
                tradeId: 'trade-1',
            },
            {
                broker: 'alpaca',
                symbol: 'TSLA',
                side: 'sell',
                qty: 5,
                price: 250.0,
                filledAt: '2026-02-08T13:00:00Z',
                assetClass: 'stock',
                orderId: 'order-2',
                tradeId: 'trade-2',
            },
        ];

        // Mock returns 1 inserted (1 was duplicate)
        const result = await upsertFills(fills);

        // Supabase mock returns data with 1 item, so 1 inserted, 1 skipped
        expect(result.inserted).toBe(1);
        expect(result.skipped).toBe(1);
    });
});
