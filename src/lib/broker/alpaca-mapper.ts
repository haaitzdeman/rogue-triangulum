/**
 * Alpaca Mapper
 *
 * Maps raw Alpaca trade activity to normalized BrokerFill.
 * Includes OCC option symbol parsing.
 */

import type { AlpacaActivity, BrokerFill } from './types';

// =============================================================================
// OCC Option Symbol Parser
// =============================================================================

/**
 * OCC standard format: ROOT(6)YYMMDD(6)C/P(1)PRICE(8)
 * Example: "AAPL  260220C00150000" → AAPL, 2026-02-20, call, 150.00
 *
 * Returns null if the symbol does not match OCC format.
 */
export function parseOccSymbol(symbol: string): {
    underlyingSymbol: string;
    expiration: string;
    callPut: 'call' | 'put';
    strike: number;
} | null {
    // OCC symbols are exactly 21 characters
    const trimmed = symbol.trim();
    if (trimmed.length < 15) return null;

    // Match: root(1-6 chars, right-padded with spaces), YYMMDD, C/P, price(8 digits)
    const match = trimmed.match(
        /^([A-Z]{1,6})\s*(\d{2})(\d{2})(\d{2})([CP])(\d{8})$/
    );
    if (!match) return null;

    const [, root, yy, mm, dd, cp, rawPrice] = match;
    const year = 2000 + parseInt(yy, 10);
    const expiration = `${year}-${mm}-${dd}`;
    const strike = parseInt(rawPrice, 10) / 1000;

    return {
        underlyingSymbol: root,
        expiration,
        callPut: cp === 'C' ? 'call' : 'put',
        strike,
    };
}

/**
 * Check if a symbol looks like an OCC option symbol.
 */
export function isOptionSymbol(symbol: string): boolean {
    return parseOccSymbol(symbol) !== null;
}

// =============================================================================
// Activity → BrokerFill Mapper
// =============================================================================

/**
 * Map an Alpaca trade activity to a normalized BrokerFill.
 * Returns null if required fields are missing or unparseable.
 */
export function mapActivityToFill(activity: AlpacaActivity): BrokerFill | null {
    // Guard required fields
    if (!activity.id || !activity.symbol || !activity.side || !activity.order_id) {
        return null;
    }

    const qty = parseFloat(activity.qty);
    const price = parseFloat(activity.price);

    if (isNaN(qty) || isNaN(price) || qty <= 0 || price <= 0) {
        return null;
    }

    const filledAt = activity.transaction_time;
    if (!filledAt) return null;

    const side = activity.side.toLowerCase();
    if (side !== 'buy' && side !== 'sell') return null;

    // Parse option symbol if applicable
    const optionInfo = parseOccSymbol(activity.symbol);
    const assetClass = optionInfo ? 'option' : 'stock';

    const fill: BrokerFill = {
        broker: 'alpaca',
        symbol: optionInfo ? optionInfo.underlyingSymbol : activity.symbol,
        side: side as 'buy' | 'sell',
        qty,
        price,
        filledAt,
        assetClass,
        orderId: activity.order_id,
        tradeId: activity.id,
    };

    if (optionInfo) {
        fill.underlyingSymbol = optionInfo.underlyingSymbol;
        fill.expiration = optionInfo.expiration;
        fill.strike = optionInfo.strike;
        fill.callPut = optionInfo.callPut;
    }

    return fill;
}
