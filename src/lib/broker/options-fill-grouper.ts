/**
 * Options Fill Grouper
 *
 * Groups broker fills for options into logical trade groups (legs of a spread).
 * Pure function — no DB calls.
 *
 * Grouping key: (underlyingSymbol, orderId, timestamp proximity ±5s)
 * - If orderId matches → same group
 * - If underlyingSymbol matches AND timestamps within 5s → same group
 * - Single-leg fills become a group of 1
 */

import type { BrokerFill } from './types';

// =============================================================================
// Types
// =============================================================================

export interface OptionLeg {
    fillId: string;
    symbol: string;          // OCC symbol
    underlying: string;
    strike: number;
    expiration: string;
    callPut: 'call' | 'put';
    side: 'buy' | 'sell';
    qty: number;
    price: number;           // per-contract premium
    filledAt: string;
    orderId: string;
}

export interface OptionsFillGroup {
    groupId: string;         // deterministic ID
    underlying: string;
    expiration: string;
    direction: 'DEBIT' | 'CREDIT' | 'EVEN';
    legs: OptionLeg[];
    netCashflow: number;     // positive = credit received, negative = debit paid
    totalContracts: number;  // contracts per leg (assumes equal sizing)
    filledAt: string;        // earliest fill timestamp
}

// =============================================================================
// Grouper
// =============================================================================

const TIMESTAMP_PROXIMITY_MS = 5000; // 5 seconds

/**
 * Group options fills into logical trade groups.
 * Stock fills are filtered out.
 */
export function groupOptionsFills(fills: BrokerFill[]): OptionsFillGroup[] {
    // Filter to options only
    const optionFills = fills.filter(f => f.assetClass === 'option');
    if (optionFills.length === 0) return [];

    // Convert to legs
    const legs: (OptionLeg & { _ts: number })[] = optionFills.map(f => ({
        fillId: f.tradeId,
        symbol: f.symbol,
        underlying: (f.underlyingSymbol || parseUnderlying(f.symbol)).toUpperCase(),
        strike: f.strike ?? 0,
        expiration: f.expiration ?? '',
        callPut: f.callPut ?? 'call',
        side: f.side,
        qty: f.qty,
        price: f.price,
        filledAt: f.filledAt,
        orderId: f.orderId,
        _ts: new Date(f.filledAt).getTime(),
    }));

    // Group by orderId first (strongest signal)
    const byOrder = new Map<string, typeof legs>();
    const ungrouped: typeof legs = [];

    for (const leg of legs) {
        if (leg.orderId) {
            const existing = byOrder.get(leg.orderId) || [];
            existing.push(leg);
            byOrder.set(leg.orderId, existing);
        } else {
            ungrouped.push(leg);
        }
    }

    // For ungrouped: cluster by (underlying, timestamp proximity)
    const clusters: (typeof legs)[] = [];
    const remaining = [...ungrouped];

    while (remaining.length > 0) {
        const seed = remaining.shift()!;
        const cluster = [seed];

        for (let i = remaining.length - 1; i >= 0; i--) {
            const candidate = remaining[i];
            if (
                candidate.underlying === seed.underlying &&
                Math.abs(candidate._ts - seed._ts) <= TIMESTAMP_PROXIMITY_MS
            ) {
                cluster.push(candidate);
                remaining.splice(i, 1);
            }
        }
        clusters.push(cluster);
    }

    // Merge orderId groups + timestamp clusters
    const allGroups: (typeof legs)[] = [
        ...Array.from(byOrder.values()),
        ...clusters,
    ];

    // Convert to OptionsFillGroup
    return allGroups.map(group => {
        const sorted = group.sort((a, b) => a._ts - b._ts);
        const underlying = sorted[0].underlying;
        const expiration = sorted[0].expiration;

        // Net cashflow: sells are credits (+), buys are debits (-)
        // Options are priced per share, contract = 100 shares
        let netCashflow = 0;
        for (const leg of sorted) {
            const multiplier = leg.side === 'sell' ? 1 : -1;
            netCashflow += multiplier * leg.price * leg.qty * 100;
        }
        netCashflow = Math.round(netCashflow * 100) / 100;

        const direction: 'DEBIT' | 'CREDIT' | 'EVEN' =
            netCashflow < -0.01 ? 'DEBIT' : netCashflow > 0.01 ? 'CREDIT' : 'EVEN';

        const totalContracts = Math.max(...sorted.map(l => l.qty));

        const groupId = `optgrp:${underlying}:${sorted[0].filledAt}:${sorted.map(l => l.fillId).join('+')}`;

        return {
            groupId,
            underlying,
            expiration,
            direction,
            legs: sorted.map(({ _ts, ...rest }) => rest),
            netCashflow,
            totalContracts,
            filledAt: sorted[0].filledAt,
        };
    });
}

// =============================================================================
// Helpers
// =============================================================================

/**
 * Parse underlying symbol from OCC option symbol.
 * OCC format: AAPL260321C00150000 → AAPL
 */
function parseUnderlying(occSymbol: string): string {
    // OCC: 1-6 char underlying followed by 6 digit date
    const match = occSymbol.match(/^([A-Z]{1,6})\d{6}/);
    return match ? match[1] : occSymbol;
}
