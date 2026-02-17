/**
 * Executions API Route Tests
 * 
 * Tests for:
 * - Live request when locked returns 403 live_locked
 * - TradeGate.execute is NOT called for rejected live requests
 */

import { POST } from '../route';
import * as tradeGateModule from '@/lib/execution/trade-gate';

// Mock the trade-gate module
jest.mock('@/lib/execution/trade-gate', () => {
    const original = jest.requireActual('@/lib/execution/trade-gate');
    return {
        ...original,
        getTradeGate: jest.fn(() => ({
            execute: jest.fn(),
        })),
        getTradingMode: jest.fn(() => 'paper'), // Always return paper (locked)
    };
});

describe('POST /api/executions', () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    it('returns 403 live_locked when requestedMode=live and effectiveMode=paper', async () => {
        // Mock getTradingMode to return 'paper' (locked)
        (tradeGateModule.getTradingMode as jest.Mock).mockReturnValue('paper');

        const request = new Request('http://localhost/api/executions', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                mode: 'live',
                symbol: 'AAPL',
                side: 'buy',
                quantity: 1,
                strategyName: 'Test',
                score: 90,
                confidence: 0.90,
                mhcApproved: true,
            }),
        });

        const response = await POST(request);
        const data = await response.json();

        // Check response status
        expect(response.status).toBe(403);

        // Check response body
        expect(data.success).toBe(false);
        expect(data.result.errorCode).toBe('live_locked');
        expect(data.result.error).toBe('LIVE mode is locked. Unlock required.');
        expect(data.result.mode).toBe('paper');
        expect(data.result.requestedMode).toBe('live');

        // CRITICAL: Verify TradeGate.execute was NOT called
        const mockTradeGate = tradeGateModule.getTradeGate();
        expect(mockTradeGate.execute).not.toHaveBeenCalled();
    });

    it('calls TradeGate.execute for paper requests', async () => {
        // Mock getTradingMode to return 'paper'
        (tradeGateModule.getTradingMode as jest.Mock).mockReturnValue('paper');

        // Mock execute to return success
        const mockExecute = jest.fn().mockResolvedValue({
            success: true,
            orderId: 'paper-123',
            mode: 'paper',
            simulated: true,
        });
        (tradeGateModule.getTradeGate as jest.Mock).mockReturnValue({
            execute: mockExecute,
        });

        const request = new Request('http://localhost/api/executions', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                mode: 'paper',
                symbol: 'AAPL',
                side: 'buy',
                quantity: 1,
                strategyName: 'Test',
                score: 90,
                confidence: 0.90,
                mhcApproved: true,
            }),
        });

        const response = await POST(request);
        const data = await response.json();

        // Check response status
        expect(response.status).toBe(200);

        // Check response body
        expect(data.success).toBe(true);
        expect(data.result.orderId).toBe('paper-123');

        // Verify TradeGate.execute WAS called with correct args
        expect(mockExecute).toHaveBeenCalledTimes(1);
        expect(mockExecute).toHaveBeenCalledWith(
            expect.objectContaining({ symbol: 'AAPL' }),
            true, // mhcApproved
            'paper' // requestedMode
        );
    });
});
