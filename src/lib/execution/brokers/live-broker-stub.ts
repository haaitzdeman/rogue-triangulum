/**
 * Live Broker Stub
 * 
 * Placeholder implementation - returns "not_configured" unless env keys exist.
 * Replace with Alpaca/IBKR integration when ready.
 * 
 * IMPORTANT: Only TradeGate should import this via broker-adapter.ts
 */

import type { BrokerAdapter } from '../broker-adapter';
import type { TradeIntent, ExecutionResult, Position } from '../execution-types';

/**
 * Check if live broker env vars are configured
 */
function hasLiveBrokerConfig(): boolean {
    // Check for common broker API key patterns
    const alpacaKey = process.env.ALPACA_API_KEY || process.env.NEXT_PUBLIC_ALPACA_API_KEY;
    const ibkrKey = process.env.IBKR_API_KEY || process.env.NEXT_PUBLIC_IBKR_API_KEY;

    return Boolean(alpacaKey || ibkrKey);
}

/**
 * Live broker stub - placeholder until real broker integration
 */
export class LiveBrokerStub implements BrokerAdapter {
    readonly name = 'live-broker-stub';

    get isConfigured(): boolean {
        return hasLiveBrokerConfig();
    }

    async placeOrder(intent: TradeIntent): Promise<ExecutionResult> {
        console.log('[LiveBrokerStub] placeOrder called:', intent.symbol);

        if (!this.isConfigured) {
            return {
                success: false,
                error: 'Live broker not configured. Set ALPACA_API_KEY or IBKR_API_KEY.',
                errorCode: 'not_configured',
                mode: 'live',
                simulated: false,
            };
        }

        // TODO: Implement real broker integration
        return {
            success: false,
            error: 'Live broker integration not yet implemented',
            errorCode: 'not_configured',
            mode: 'live',
            simulated: false,
        };
    }

    async cancelOrder(orderId: string): Promise<{ success: boolean; error?: string }> {
        console.log('[LiveBrokerStub] cancelOrder called:', orderId);

        if (!this.isConfigured) {
            return { success: false, error: 'Live broker not configured' };
        }

        return { success: false, error: 'Not implemented' };
    }

    async getPositions(): Promise<Position[]> {
        console.log('[LiveBrokerStub] getPositions called');

        if (!this.isConfigured) {
            return [];
        }

        return [];
    }

    async getAccountInfo(): Promise<{ equity: number; buyingPower: number; cash: number } | null> {
        console.log('[LiveBrokerStub] getAccountInfo called');

        if (!this.isConfigured) {
            return null;
        }

        return null;
    }
}
