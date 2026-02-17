/**
 * TradeGate Tests
 * 
 * Tests for:
 * - requestedMode=live when locked => live_locked
 * - requestedMode=paper => works as before  
 * - low score/confidence => mhc_rejected unless mhcApproved true
 */

import {
    getTradeGate,
    createTradeIntent,
    getTradingMode,
    lockLiveTrading,
} from '../trade-gate';

// Reset state before each test
beforeEach(() => {
    lockLiveTrading(); // Ensure locked to paper
});

describe('TradeGate', () => {
    describe('Live Mode Safety', () => {
        it('rejects requestedMode=live when locked to paper', async () => {
            const tradeGate = getTradeGate();
            const intent = createTradeIntent(
                'AAPL',
                'buy',
                1,
                {
                    desk: 'swing',
                    strategyName: 'Test',
                    score: 90,
                    confidence: 0.90,
                    reasons: ['Test'],
                }
            );

            // Current mode should be paper
            expect(getTradingMode()).toBe('paper');

            // Request live mode - should reject
            const result = await tradeGate.execute(intent, true, 'live');

            expect(result.success).toBe(false);
            expect(result.errorCode).toBe('live_locked');
            expect(result.error).toContain('LIVE mode is locked');
            expect(result.mode).toBe('paper');
        });

        it('allows paper trades when mode is paper', async () => {
            const tradeGate = getTradeGate();
            const intent = createTradeIntent(
                'AAPL',
                'buy',
                1,
                {
                    desk: 'swing',
                    strategyName: 'Test',
                    score: 90,
                    confidence: 0.90,
                    reasons: ['Test'],
                }
            );

            // Request paper mode - should succeed
            const result = await tradeGate.execute(intent, true, 'paper');

            expect(result.success).toBe(true);
            expect(result.mode).toBe('paper');
            expect(result.simulated).toBe(true);
            expect(result.orderId).toBeDefined();
        });
    });

    describe('MHC Enforcement', () => {
        it('rejects low score/confidence when mhcApproved=false', async () => {
            const tradeGate = getTradeGate();
            const intent = createTradeIntent(
                'AAPL',
                'buy',
                1,
                {
                    desk: 'swing',
                    strategyName: 'Test',
                    score: 60, // Below MIN_SCORE (75)
                    confidence: 0.60, // Below MIN_CONFIDENCE (0.70)
                    reasons: ['Test low score'],
                }
            );

            // No MHC approval - should reject
            const result = await tradeGate.execute(intent, false, 'paper');

            expect(result.success).toBe(false);
            expect(result.errorCode).toBe('mhc_rejected');
            expect(result.error).toContain('MHC required');
        });

        it('allows low score/confidence when mhcApproved=true', async () => {
            const tradeGate = getTradeGate();
            const intent = createTradeIntent(
                'AAPL',
                'buy',
                1,
                {
                    desk: 'swing',
                    strategyName: 'Test',
                    score: 60, // Below MIN_SCORE (75)
                    confidence: 0.60, // Below MIN_CONFIDENCE (0.70)
                    reasons: ['Test low score'],
                }
            );

            // With MHC approval - should succeed
            const result = await tradeGate.execute(intent, true, 'paper');

            expect(result.success).toBe(true);
            expect(result.mode).toBe('paper');
            expect(result.orderId).toBeDefined();
        });

        it('allows high score/confidence without MHC approval', async () => {
            const tradeGate = getTradeGate();
            const intent = createTradeIntent(
                'AAPL',
                'buy',
                1,
                {
                    desk: 'swing',
                    strategyName: 'Test',
                    score: 85, // Above MIN_SCORE (75)
                    confidence: 0.85, // Above MIN_CONFIDENCE (0.70)
                    reasons: ['Test high score'],
                }
            );

            // No MHC approval needed - should succeed
            const result = await tradeGate.execute(intent, false, 'paper');

            expect(result.success).toBe(true);
            expect(result.mode).toBe('paper');
        });

        it('requires MHC for unapproved symbols', async () => {
            const tradeGate = getTradeGate();
            const intent = createTradeIntent(
                'RANDOM', // Not in APPROVED_WATCHLIST
                'buy',
                1,
                {
                    desk: 'swing',
                    strategyName: 'Test',
                    score: 90,
                    confidence: 0.90,
                    reasons: ['Test unapproved symbol'],
                }
            );

            // No MHC approval - should reject
            const result = await tradeGate.execute(intent, false, 'paper');

            expect(result.success).toBe(false);
            expect(result.errorCode).toBe('mhc_rejected');
            expect(result.error).toContain('not in approved watchlist');
        });
    });
});
