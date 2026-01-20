/**
 * Paper Broker
 * 
 * Simulated execution with realistic behavior:
 * - Fetches real quotes from Polygon
 * - Applies slippage model (0.02% liquid, 0.10% illiquid)
 * - Records executions in memory (persisted via API on server-side)
 * 
 * NOTE: This file is client-safe - no Node.js imports.
 * Persistence is handled via POST /api/executions.
 * 
 * IMPORTANT: Only TradeGate should import this.
 */

import type { BrokerAdapter } from './broker-adapter';
import type { TradeIntent, ExecutionResult, Position, PaperExecution } from './execution-types';
import { SLIPPAGE_CONFIG } from './execution-types';

// In-memory execution log (client-side)
const executionLog: PaperExecution[] = [];

/**
 * Generate unique ID
 */
function generateId(): string {
    return `paper-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}

/**
 * Get slippage for a symbol
 */
function getSlippage(symbol: string, side: 'buy' | 'sell'): number {
    const isLiquid = SLIPPAGE_CONFIG.LIQUID_SYMBOLS.includes(symbol);
    const baseSlippage = isLiquid ? SLIPPAGE_CONFIG.SLIPPAGE_LIQUID : SLIPPAGE_CONFIG.SLIPPAGE_ILLIQUID;

    // Buyers pay higher, sellers receive lower (both unfavorable)
    return side === 'buy' ? baseSlippage : -baseSlippage;
}

/**
 * Fetch current quote from Polygon (or fallback)
 */
async function fetchQuote(symbol: string): Promise<number | null> {
    const apiKey = process.env.POLYGON_API_KEY || process.env.NEXT_PUBLIC_POLYGON_API_KEY;

    if (!apiKey) {
        console.warn('[PaperBroker] No Polygon API key - using mock price');
        return null;
    }

    try {
        // Use previous close as execution price (safer for daily swing)
        const url = `https://api.polygon.io/v2/aggs/ticker/${symbol}/prev?apiKey=${apiKey}`;
        const response = await fetch(url);
        const data = await response.json();

        if (data.results && data.results.length > 0) {
            return data.results[0].c; // Previous close
        }

        return null;
    } catch (error) {
        console.error('[PaperBroker] Error fetching quote:', error);
        return null;
    }
}

/**
 * Persist execution to server (non-blocking)
 */
async function persistExecution(execution: PaperExecution): Promise<void> {
    try {
        // On server-side (API routes), we can use the store directly
        // On client-side, this will call the API
        if (typeof window === 'undefined') {
            // Server-side - dynamic import to avoid bundling fs
            const { addExecution } = await import('./paper-store');
            addExecution(execution);
        } else {
            // Client-side - call API (future enhancement)
            // For now, just log to memory
            executionLog.push(execution);
            console.log('[PaperBroker] Execution logged to memory (client-side)');
        }
    } catch (error) {
        console.log('[PaperBroker] Could not persist execution:', error);
    }
}

/**
 * Paper broker implementation
 */
export class PaperBroker implements BrokerAdapter {
    readonly name = 'paper-broker';
    readonly isConfigured = true; // Paper broker is always available

    private positions: Map<string, Position> = new Map();

    async placeOrder(intent: TradeIntent): Promise<ExecutionResult> {
        console.log(`[PaperBroker] Executing paper trade: ${intent.side} ${intent.quantity} ${intent.symbol}`);

        try {
            // 1. Get current price
            let basePrice = await fetchQuote(intent.symbol);

            // Fallback to limit price or a mock value
            if (!basePrice) {
                basePrice = intent.limitPrice || 100;
                console.log(`[PaperBroker] Using fallback price: ${basePrice}`);
            }

            // 2. Apply slippage
            const slippage = getSlippage(intent.symbol, intent.side);
            const fillPrice = basePrice * (1 + slippage);
            const slippagePercent = slippage * 100;

            // 3. Calculate value and commission
            const value = fillPrice * intent.quantity;
            const commission = 0; // Paper trading has no commission

            // 4. Create execution record
            const execution: PaperExecution = {
                id: generateId(),
                intentId: intent.id,
                symbol: intent.symbol,
                side: intent.side,
                quantity: intent.quantity,
                requestedPrice: basePrice,
                fillPrice: Math.round(fillPrice * 100) / 100, // Round to 2 decimals
                slippagePercent: Math.round(slippagePercent * 10000) / 10000,
                value: Math.round(value * 100) / 100,
                commission,
                strategyName: intent.source.strategyName,
                signalId: intent.source.signalId,
                status: 'filled',
                filledAt: new Date().toISOString(),
                createdAt: new Date().toISOString(),
            };

            // 5. Persist (non-blocking)
            persistExecution(execution).catch(() => { });

            // 6. Update positions
            this.updatePosition(intent.symbol, intent.side, intent.quantity, fillPrice);

            // 7. Return success
            return {
                success: true,
                orderId: execution.id,
                fillPrice: execution.fillPrice,
                fillQuantity: intent.quantity,
                filledAt: execution.filledAt,
                mode: 'paper',
                simulated: true,
                slippageApplied: slippagePercent,
                commission: 0,
            };

        } catch (error) {
            console.error('[PaperBroker] Execution error:', error);
            return {
                success: false,
                error: String(error),
                errorCode: 'invalid_order',
                mode: 'paper',
                simulated: true,
            };
        }
    }

    async cancelOrder(orderId: string): Promise<{ success: boolean; error?: string }> {
        console.log('[PaperBroker] cancelOrder called:', orderId);
        // Paper orders are filled instantly, cannot cancel
        return { success: false, error: 'Paper orders are filled instantly' };
    }

    async getPositions(): Promise<Position[]> {
        return Array.from(this.positions.values());
    }

    async getAccountInfo(): Promise<{ equity: number; buyingPower: number; cash: number }> {
        // Calculate from positions
        let equity = 100000; // Starting paper balance
        const positions = await this.getPositions();

        for (const pos of positions) {
            equity += pos.realizedPnL;
        }

        return {
            equity: Math.round(equity * 100) / 100,
            buyingPower: equity,
            cash: equity,
        };
    }

    /**
     * Update position after trade
     */
    private updatePosition(
        symbol: string,
        side: 'buy' | 'sell',
        quantity: number,
        fillPrice: number
    ): void {
        const existing = this.positions.get(symbol);

        if (!existing) {
            // New position
            this.positions.set(symbol, {
                symbol,
                quantity: side === 'buy' ? quantity : -quantity,
                avgEntryPrice: fillPrice,
                currentPrice: fillPrice,
                unrealizedPnL: 0,
                realizedPnL: 0,
                side: side === 'buy' ? 'long' : 'short',
            });
        } else {
            // Update existing
            const delta = side === 'buy' ? quantity : -quantity;
            const newQty = existing.quantity + delta;

            if (Math.sign(newQty) !== Math.sign(existing.quantity) || newQty === 0) {
                // Position closed or flipped
                const pnl = (fillPrice - existing.avgEntryPrice) * Math.min(Math.abs(delta), Math.abs(existing.quantity)) * Math.sign(existing.quantity);
                existing.realizedPnL += pnl;
            }

            if (newQty !== 0) {
                existing.quantity = newQty;
                existing.side = newQty > 0 ? 'long' : 'short';
                // Update avg entry for adds
                if (Math.sign(delta) === Math.sign(existing.quantity)) {
                    existing.avgEntryPrice = (existing.avgEntryPrice * Math.abs(existing.quantity - delta) + fillPrice * Math.abs(delta)) / Math.abs(existing.quantity);
                }
            } else {
                this.positions.delete(symbol);
            }
        }
    }
}

/**
 * Get paper executions from memory (for client-side access)
 */
export function getPaperExecutionsFromMemory(): PaperExecution[] {
    return [...executionLog];
}
