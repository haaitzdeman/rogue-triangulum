/**
 * Broker Adapter Interface
 * 
 * Common interface for all broker implementations.
 * TradeGate uses this to route orders to paper or live brokers.
 * 
 * IMPORTANT: Only TradeGate should import broker implementations.
 */

import type { TradeIntent, ExecutionResult, Position } from './execution-types';

/**
 * Broker adapter interface - implemented by paper and live brokers
 */
export interface BrokerAdapter {
    /**
     * Broker identifier
     */
    readonly name: string;

    /**
     * Whether this broker is configured and ready
     */
    readonly isConfigured: boolean;

    /**
     * Place an order
     */
    placeOrder(intent: TradeIntent): Promise<ExecutionResult>;

    /**
     * Cancel an order
     */
    cancelOrder(orderId: string): Promise<{
        success: boolean;
        error?: string;
    }>;

    /**
     * Get current positions
     */
    getPositions(): Promise<Position[]>;

    /**
     * Get account info
     */
    getAccountInfo(): Promise<{
        equity: number;
        buyingPower: number;
        cash: number;
    } | null>;
}

import { LiveBrokerStub } from './brokers/live-broker-stub';

/**
 * Get the live broker adapter (stub for now)
 * This is the ONLY export - TradeGate imports this
 */
export function getLiveBrokerAdapter(): BrokerAdapter {
    return new LiveBrokerStub();
}
