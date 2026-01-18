/**
 * Order Manager
 * 
 * Manages paper/live orders and links them to forecasts.
 * Tracks order lifecycle and P&L.
 */

import { v4 as uuidv4 } from 'uuid';
import type { Order, Position, TradeIntent, TradeDirection } from '../core/types';

/**
 * Order status
 */
export type OrderStatus = 'pending' | 'open' | 'partial' | 'filled' | 'cancelled' | 'rejected';

/**
 * Order log entry for audit
 */
export interface OrderLogEntry {
    id: string;
    timestamp: Date;

    // Order details
    orderId: string;
    symbol: string;
    direction: TradeDirection;
    quantity: number;
    orderType: string;

    // Status
    status: OrderStatus;
    filledQuantity: number;
    avgFillPrice?: number;

    // Linked forecast
    forecastId?: string;
    intentId?: string;

    // Mode
    mode: 'PAPER' | 'LIVE';

    // P&L (if closed)
    realizedPnL?: number;
}

// In-memory stores
const orders: Map<string, Order> = new Map();
const positions: Map<string, Position> = new Map();
const orderLog: OrderLogEntry[] = [];

/**
 * Order Manager
 */
export class OrderManager {

    /**
     * Create order from trade intent
     */
    createOrder(intent: TradeIntent, mode: 'PAPER' | 'LIVE'): Order {
        const orderId = `${mode.toLowerCase()}-${Date.now()}-${uuidv4().slice(0, 8)}`;

        const order: Order = {
            id: orderId,
            symbol: intent.symbol,
            direction: intent.direction,
            quantity: intent.quantity,
            orderType: intent.orderType,
            limitPrice: intent.limitPrice,
            stopPrice: intent.stopPrice,
            status: 'pending',
            filledQuantity: 0,
            createdAt: new Date(),
            updatedAt: new Date(),
            forecastId: intent.forecastId,
            intentId: intent.id,
        };

        orders.set(orderId, order);
        this.logOrder(order, mode);

        console.log(`[OrderManager] Created order: ${orderId}`);
        return order;
    }

    /**
     * Fill order (paper trading simulation)
     */
    fillOrder(orderId: string, fillPrice: number, mode: 'PAPER' | 'LIVE'): Order | null {
        const order = orders.get(orderId);
        if (!order) return null;

        order.status = 'filled';
        order.filledQuantity = order.quantity;
        order.avgFillPrice = fillPrice;
        order.updatedAt = new Date();

        // Create/update position
        this.updatePosition(order);

        this.logOrder(order, mode);
        console.log(`[OrderManager] Filled order: ${orderId} at $${fillPrice}`);

        return order;
    }

    /**
     * Cancel order
     */
    cancelOrder(orderId: string, mode: 'PAPER' | 'LIVE'): boolean {
        const order = orders.get(orderId);
        if (!order || order.status === 'filled') return false;

        order.status = 'cancelled';
        order.updatedAt = new Date();

        this.logOrder(order, mode);
        console.log(`[OrderManager] Cancelled order: ${orderId}`);

        return true;
    }

    /**
     * Update position from filled order
     */
    private updatePosition(order: Order): void {
        if (!order.avgFillPrice) return;

        const existing = positions.get(order.symbol);

        if (existing) {
            // Closing or adding to position
            if (existing.side === 'long' && order.direction === 'short' ||
                existing.side === 'short' && order.direction === 'long') {
                // Closing position
                const pnl = order.direction === 'short'
                    ? (order.avgFillPrice - existing.entryPrice) * existing.quantity
                    : (existing.entryPrice - order.avgFillPrice) * existing.quantity;

                console.log(`[OrderManager] Closed position ${order.symbol}: P&L $${pnl.toFixed(2)}`);
                positions.delete(order.symbol);
            } else {
                // Adding to position - average in
                const totalQty = existing.quantity + order.filledQuantity;
                const avgPrice = (existing.entryPrice * existing.quantity +
                    order.avgFillPrice * order.filledQuantity) / totalQty;
                existing.quantity = totalQty;
                existing.entryPrice = avgPrice;
                existing.marketValue = avgPrice * totalQty;
            }
        } else {
            // New position
            const position: Position = {
                symbol: order.symbol,
                quantity: order.filledQuantity,
                side: order.direction === 'long' ? 'long' : 'short',
                entryPrice: order.avgFillPrice,
                currentPrice: order.avgFillPrice,
                marketValue: order.avgFillPrice * order.filledQuantity,
                unrealizedPnL: 0,
                unrealizedPnLPercent: 0,
            };
            positions.set(order.symbol, position);
        }
    }

    /**
     * Log order for audit
     */
    private logOrder(order: Order, mode: 'PAPER' | 'LIVE'): void {
        orderLog.push({
            id: uuidv4(),
            timestamp: new Date(),
            orderId: order.id,
            symbol: order.symbol,
            direction: order.direction,
            quantity: order.quantity,
            orderType: order.orderType,
            status: order.status,
            filledQuantity: order.filledQuantity,
            avgFillPrice: order.avgFillPrice,
            forecastId: order.forecastId,
            intentId: order.intentId,
            mode,
        });

        // Keep only last 500 entries
        if (orderLog.length > 500) {
            orderLog.shift();
        }
    }

    /**
     * Get order by ID
     */
    getOrder(orderId: string): Order | undefined {
        return orders.get(orderId);
    }

    /**
     * Get all orders
     */
    getOrders(filter?: { status?: OrderStatus; symbol?: string }): Order[] {
        let result = Array.from(orders.values());

        if (filter?.status) {
            result = result.filter(o => o.status === filter.status);
        }
        if (filter?.symbol) {
            result = result.filter(o => o.symbol === filter.symbol);
        }

        return result.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
    }

    /**
     * Get open orders
     */
    getOpenOrders(): Order[] {
        return this.getOrders({ status: 'open' });
    }

    /**
     * Get positions
     */
    getPositions(): Position[] {
        return Array.from(positions.values());
    }

    /**
     * Get position by symbol
     */
    getPosition(symbol: string): Position | undefined {
        return positions.get(symbol);
    }

    /**
     * Update position prices (mark-to-market)
     */
    updatePrices(prices: Record<string, number>): void {
        Array.from(positions.entries()).forEach(([symbol, position]) => {
            const price = prices[symbol];
            if (price) {
                position.currentPrice = price;
                position.marketValue = price * position.quantity;
                position.unrealizedPnL = position.side === 'long'
                    ? (price - position.entryPrice) * position.quantity
                    : (position.entryPrice - price) * position.quantity;
                position.unrealizedPnLPercent = position.entryPrice > 0
                    ? (position.unrealizedPnL / (position.entryPrice * position.quantity)) * 100
                    : 0;
            }
        });
    }

    /**
     * Get order log
     */
    getOrderLog(limit?: number): OrderLogEntry[] {
        const entries = [...orderLog].reverse();
        return limit ? entries.slice(0, limit) : entries;
    }

    /**
     * Get orders by forecast
     */
    getOrdersByForecast(forecastId: string): Order[] {
        return Array.from(orders.values())
            .filter(o => o.forecastId === forecastId);
    }

    /**
     * Calculate total P&L
     */
    getTotalUnrealizedPnL(): number {
        return Array.from(positions.values())
            .reduce((sum, p) => sum + p.unrealizedPnL, 0);
    }
}

// Singleton
let managerInstance: OrderManager | null = null;

export function getOrderManager(): OrderManager {
    if (!managerInstance) {
        managerInstance = new OrderManager();
    }
    return managerInstance;
}
