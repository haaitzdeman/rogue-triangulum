/**
 * Reconcile Engine v2 — Jest Tests
 *
 * Tests:
 * A) Transparency: reconcileStatus + matchExplanation returned
 * B) BLOCKED_MANUAL_OVERRIDE status
 * C) AMBIGUOUS: many fills → candidates with whyRejected
 * D) Partial exit: two exit fills, entry stays ENTERED until full qty
 * E) Scale-in: two entry fills → correct avgEntryPrice and totalQty
 * F) Legacy: ENTERED → EXITED with correct PnL, SHORT, BREAKEVEN, R-multiple
 */

import {
    reconcileEntries,
    computeOutcome,
    matchFillsToEntry,
    matchFillsWithExplanation,
    computeVWAP,
    computeRealizedPnL,
    type ReconcilableEntry,
} from '../reconcile-engine';
import type { BrokerFill } from '../types';

// =============================================================================
// Helpers
// =============================================================================

function makeFill(overrides: Partial<BrokerFill> = {}): BrokerFill {
    return {
        broker: 'alpaca',
        symbol: 'AAPL',
        side: 'buy',
        qty: 100,
        price: 150.00,
        filledAt: '2026-02-10T10:00:00Z',
        assetClass: 'stock',
        orderId: 'ord-1',
        tradeId: 'trade-1',
        ...overrides,
    };
}

function makeEntry(overrides: Partial<ReconcilableEntry> = {}): ReconcilableEntry {
    return {
        id: 'entry-1',
        symbol: 'AAPL',
        effective_date: '2026-02-10',
        status: 'ENTERED',
        trade_direction: 'LONG',
        entry_price: null,
        exit_price: null,
        size: null,
        manual_override: false,
        entry_fill_id: null,
        exit_fill_id: null,
        ...overrides,
    };
}

// =============================================================================
// A) Transparency
// =============================================================================

describe('matchFillsWithExplanation', () => {
    test('returns explanation for symbol match', () => {
        const entry = makeEntry({ symbol: 'AAPL', effective_date: '2026-02-10' });
        const fills = [
            makeFill({ side: 'buy', tradeId: 't1' }),
            makeFill({ side: 'sell', tradeId: 't2', filledAt: '2026-02-10T15:00:00Z' }),
        ];

        const result = matchFillsWithExplanation(entry, fills);
        expect(result.status).toBe('MATCHED');
        expect(result.explanation.length).toBeGreaterThan(0);
        expect(result.explanation.some(e => e.includes('matched symbol'))).toBe(true);
        expect(result.explanation.some(e => e.includes('Fully matched'))).toBe(true);
    });

    test('returns NONE with explanation when no fills match symbol', () => {
        const entry = makeEntry({ symbol: 'TSLA' });
        const fills = [makeFill({ symbol: 'AAPL' })];

        const result = matchFillsWithExplanation(entry, fills);
        expect(result.status).toBe('NONE');
        expect(result.explanation.some(e => e.includes('No fills matched symbol'))).toBe(true);
    });

    test('returns NONE with explanation when fills outside date window', () => {
        const entry = makeEntry({ effective_date: '2026-02-10' });
        const fills = [
            makeFill({ filledAt: '2026-02-01T10:00:00Z', tradeId: 't1' }),
            makeFill({ side: 'sell', filledAt: '2026-02-01T15:00:00Z', tradeId: 't2' }),
        ];

        const result = matchFillsWithExplanation(entry, fills);
        expect(result.status).toBe('NONE');
        expect(result.ambiguityCandidates.length).toBeGreaterThan(0);
        expect(result.ambiguityCandidates[0].whyRejected.some(r => r.includes('Outside date window'))).toBe(true);
    });

    test('returns PARTIAL when exit qty < entry qty', () => {
        const entry = makeEntry({ symbol: 'AAPL', trade_direction: 'LONG' });
        const fills = [
            makeFill({ side: 'buy', qty: 100, tradeId: 't1' }),
            makeFill({ side: 'sell', qty: 50, tradeId: 't2', filledAt: '2026-02-10T15:00:00Z' }),
        ];

        const result = matchFillsWithExplanation(entry, fills);
        expect(result.status).toBe('PARTIAL');
        expect(result.explanation.some(e => e.includes('Partial exit'))).toBe(true);
    });
});

// =============================================================================
// B) BLOCKED_MANUAL_OVERRIDE
// =============================================================================

describe('reconcileEntries — manual_override', () => {
    test('returns BLOCKED_MANUAL_OVERRIDE status', () => {
        const entries = [makeEntry({ status: 'ENTERED', manual_override: true })];
        const fills = [
            makeFill({ side: 'buy', tradeId: 't1' }),
            makeFill({ side: 'sell', tradeId: 't2', filledAt: '2026-02-10T15:00:00Z' }),
        ];

        const updates = reconcileEntries(entries, fills, 'batch-test');
        expect(updates).toHaveLength(1);
        expect(updates[0].reconcileStatus).toBe('BLOCKED_MANUAL_OVERRIDE');
        expect(updates[0].matchExplanation).toContain('Entry has manual_override=true — skipping auto-reconcile');
        // No status change to EXITED
        expect(updates[0].updates.status).toBeUndefined();
    });
});

// =============================================================================
// C) AMBIGUOUS
// =============================================================================

describe('reconcileEntries — ambiguous', () => {
    test('marks AMBIGUOUS when >10 fills match', () => {
        const entries = [makeEntry({ status: 'ENTERED' })];
        // 6 buys + 6 sells = 12 fills
        const fills: BrokerFill[] = [];
        for (let i = 0; i < 6; i++) {
            fills.push(makeFill({ side: 'buy', tradeId: `buy-${i}`, filledAt: `2026-02-10T0${9 + i}:00:00Z` }));
            fills.push(makeFill({ side: 'sell', tradeId: `sell-${i}`, filledAt: `2026-02-10T1${i}:30:00Z` }));
        }

        const updates = reconcileEntries(entries, fills, 'batch-test');
        expect(updates).toHaveLength(1);
        expect(updates[0].reconcileStatus).toBe('AMBIGUOUS');
        expect(updates[0].ambiguityCandidates.length).toBeLessThanOrEqual(3);
    });
});

// =============================================================================
// D) Partial Exit
// =============================================================================

describe('reconcileEntries — partial exit', () => {
    test('entry stays ENTERED when only partial qty exited', () => {
        const entries = [makeEntry({ status: 'ENTERED', trade_direction: 'LONG' })];
        const fills = [
            makeFill({ side: 'buy', qty: 100, price: 150, tradeId: 't1' }),
            makeFill({ side: 'sell', qty: 50, price: 155, tradeId: 't2', filledAt: '2026-02-10T15:00:00Z' }),
        ];

        const updates = reconcileEntries(entries, fills, 'batch-test');
        expect(updates).toHaveLength(1);
        expect(updates[0].reconcileStatus).toBe('PARTIAL');
        expect(updates[0].updates.status).toBe('ENTERED'); // Not changed to EXITED
        expect(updates[0].updates.exited_qty).toBe(50);
        expect(updates[0].updates.total_qty).toBe(100);
        expect(updates[0].updates.realized_pnl_dollars).toBe(250); // (155-150)*50
    });

    test('entry transitions to EXITED when full qty exited via multiple exits', () => {
        const entries = [makeEntry({ status: 'ENTERED', trade_direction: 'LONG' })];
        const fills = [
            makeFill({ side: 'buy', qty: 100, price: 150, tradeId: 't1' }),
            makeFill({ side: 'sell', qty: 60, price: 155, tradeId: 't2', filledAt: '2026-02-10T14:00:00Z' }),
            makeFill({ side: 'sell', qty: 40, price: 158, tradeId: 't3', filledAt: '2026-02-10T15:00:00Z' }),
        ];

        const updates = reconcileEntries(entries, fills, 'batch-test');
        expect(updates).toHaveLength(1);
        expect(updates[0].reconcileStatus).toBe('MATCHED');
        expect(updates[0].updates.status).toBe('EXITED');
        expect(updates[0].updates.exited_qty).toBe(100);
        expect(updates[0].updates.total_qty).toBe(100);
        // Realized PnL: (155-150)*60 + (158-150)*40 = 300 + 320 = 620
        expect(updates[0].updates.realized_pnl_dollars).toBe(620);
        expect(updates[0].updates.result).toBe('WIN');
    });
});

// =============================================================================
// E) Scale-In
// =============================================================================

describe('computeVWAP', () => {
    test('computes VWAP for multiple fills', () => {
        const fills = [
            makeFill({ price: 100, qty: 50 }),
            makeFill({ price: 110, qty: 50, tradeId: 't2' }),
        ];

        const { avgPrice, totalQty } = computeVWAP(fills);
        expect(avgPrice).toBe(105); // (100*50 + 110*50) / 100
        expect(totalQty).toBe(100);
    });

    test('computes VWAP for unequal sizes', () => {
        const fills = [
            makeFill({ price: 100, qty: 30 }),
            makeFill({ price: 110, qty: 70, tradeId: 't2' }),
        ];

        const { avgPrice, totalQty } = computeVWAP(fills);
        // (100*30 + 110*70) / 100 = (3000 + 7700) / 100 = 107
        expect(avgPrice).toBe(107);
        expect(totalQty).toBe(100);
    });

    test('returns 0 for empty fills', () => {
        const { avgPrice, totalQty } = computeVWAP([]);
        expect(avgPrice).toBe(0);
        expect(totalQty).toBe(0);
    });
});

describe('computeRealizedPnL', () => {
    test('computes realized PnL for LONG exits', () => {
        const exits = [
            makeFill({ side: 'sell', price: 110, qty: 50, tradeId: 't2' }),
            makeFill({ side: 'sell', price: 115, qty: 30, tradeId: 't3', filledAt: '2026-02-10T16:00:00Z' }),
        ];

        const result = computeRealizedPnL(100, exits, 'LONG');
        // (110-100)*50 + (115-100)*30 = 500 + 450 = 950
        expect(result.realizedPnl).toBe(950);
        expect(result.exitedQty).toBe(80);
    });

    test('computes realized PnL for SHORT exits', () => {
        const exits = [
            makeFill({ side: 'buy', price: 90, qty: 100, tradeId: 't2' }),
        ];

        const result = computeRealizedPnL(100, exits, 'SHORT');
        // (100-90)*100 = 1000
        expect(result.realizedPnl).toBe(1000);
        expect(result.exitedQty).toBe(100);
    });
});

describe('reconcileEntries — scale-in', () => {
    test('multiple entry fills compute avgEntryPrice and totalQty', () => {
        const entries = [makeEntry({ status: 'ENTERED', trade_direction: 'LONG' })];
        const fills = [
            makeFill({ side: 'buy', qty: 50, price: 100, tradeId: 't1', filledAt: '2026-02-10T09:30:00Z' }),
            makeFill({ side: 'buy', qty: 50, price: 110, tradeId: 't2', filledAt: '2026-02-10T10:00:00Z' }),
            makeFill({ side: 'sell', qty: 100, price: 120, tradeId: 't3', filledAt: '2026-02-10T15:00:00Z' }),
        ];

        const updates = reconcileEntries(entries, fills, 'batch-test');
        expect(updates).toHaveLength(1);
        expect(updates[0].updates.avg_entry_price).toBe(105); // VWAP
        expect(updates[0].updates.total_qty).toBe(100);
        expect(updates[0].updates.exited_qty).toBe(100);
        expect(updates[0].reconcileStatus).toBe('MATCHED');
        // Realized PnL: (120-105)*100 = 1500
        expect(updates[0].updates.realized_pnl_dollars).toBe(1500);
    });
});

// =============================================================================
// F) Legacy PnL Tests (backward compatibility)
// =============================================================================

describe('computeOutcome', () => {
    test('LONG: computes positive PnL for winning trade', () => {
        const entry = makeFill({ side: 'buy', price: 100, qty: 50 });
        const exit = makeFill({ side: 'sell', price: 110, filledAt: '2026-02-10T15:00:00Z' });

        const result = computeOutcome(entry, exit, { direction: 'LONG' });

        expect(result.exitPrice).toBe(110);
        expect(result.pnlDollars).toBe(500);
        expect(result.pnlPercent).toBe(10);
        expect(result.result).toBe('WIN');
    });

    test('LONG: computes negative PnL for losing trade', () => {
        const entry = makeFill({ side: 'buy', price: 100, qty: 50 });
        const exit = makeFill({ side: 'sell', price: 95, filledAt: '2026-02-10T15:00:00Z' });

        const result = computeOutcome(entry, exit, { direction: 'LONG' });

        expect(result.pnlDollars).toBe(-250);
        expect(result.pnlPercent).toBe(-5);
        expect(result.result).toBe('LOSS');
    });

    test('SHORT: computes positive PnL for winning short', () => {
        const entry = makeFill({ side: 'sell', price: 100, qty: 50 });
        const exit = makeFill({ side: 'buy', price: 90, filledAt: '2026-02-10T15:00:00Z' });

        const result = computeOutcome(entry, exit, { direction: 'SHORT' });
        expect(result.pnlDollars).toBe(500);
        expect(result.result).toBe('WIN');
    });

    test('computes R-multiple when stopLoss provided', () => {
        const entry = makeFill({ side: 'buy', price: 100, qty: 50 });
        const exit = makeFill({ side: 'sell', price: 112, filledAt: '2026-02-10T15:00:00Z' });

        const result = computeOutcome(entry, exit, {
            direction: 'LONG',
            stopLoss: 96,
        });

        expect(result.rMultiple).toBe(3);
    });

    test('R-multiple is null when no stopLoss', () => {
        const entry = makeFill({ price: 100 });
        const exit = makeFill({ side: 'sell', price: 110, filledAt: '2026-02-10T15:00:00Z' });

        const result = computeOutcome(entry, exit, { direction: 'LONG' });
        expect(result.rMultiple).toBeNull();
    });

    test('BREAKEVEN at threshold', () => {
        const entry = makeFill({ side: 'buy', price: 100.00, qty: 50 });
        const exit = makeFill({ side: 'sell', price: 100.00, filledAt: '2026-02-10T15:00:00Z' });

        const result = computeOutcome(entry, exit, { direction: 'LONG' });
        expect(result.result).toBe('BREAKEVEN');
    });
});

describe('matchFillsToEntry (legacy)', () => {
    test('matches fills within date window by symbol', () => {
        const entry = makeEntry({ symbol: 'AAPL', effective_date: '2026-02-10' });
        const fills = [
            makeFill({ side: 'buy', filledAt: '2026-02-10T10:00:00Z', tradeId: 't1' }),
            makeFill({ side: 'sell', filledAt: '2026-02-10T15:00:00Z', tradeId: 't2' }),
        ];

        const result = matchFillsToEntry(entry, fills);
        expect(result).not.toBeNull();
        expect(result!.entryFill.side).toBe('buy');
        expect(result!.exitFill.side).toBe('sell');
    });

    test('returns null if only one fill exists', () => {
        const entry = makeEntry({ symbol: 'AAPL' });
        const fills = [makeFill({ side: 'buy' })];

        expect(matchFillsToEntry(entry, fills)).toBeNull();
    });
});

describe('reconcileEntries (legacy)', () => {
    test('transitions ENTERED → EXITED with correct PnL', () => {
        const entries = [makeEntry({ status: 'ENTERED', trade_direction: 'LONG' })];
        const fills = [
            makeFill({ side: 'buy', price: 150, filledAt: '2026-02-10T10:00:00Z', tradeId: 't1' }),
            makeFill({ side: 'sell', price: 160, filledAt: '2026-02-10T15:00:00Z', tradeId: 't2' }),
        ];

        const updates = reconcileEntries(entries, fills, 'batch-test');

        expect(updates).toHaveLength(1);
        expect(updates[0].updates.status).toBe('EXITED');
        expect(updates[0].updates.exit_price).toBe(160);
        expect(updates[0].updates.realized_pnl_dollars).toBe(1000);
        expect(updates[0].updates.result).toBe('WIN');
        expect(updates[0].updates.entry_fill_id).toBe('alpaca:t1');
        expect(updates[0].updates.exit_fill_id).toBe('alpaca:t2');
        expect(updates[0].updates.system_update_reason).toBe('auto-reconcile:batch-test');
        expect(updates[0].reconcileStatus).toBe('MATCHED');
        expect(updates[0].matchExplanation.length).toBeGreaterThan(0);
    });

    test('skips already EXITED entries', () => {
        const entries = [makeEntry({ status: 'EXITED' })];
        const fills = [
            makeFill({ side: 'buy', tradeId: 't1' }),
            makeFill({ side: 'sell', tradeId: 't2', filledAt: '2026-02-10T15:00:00Z' }),
        ];

        const updates = reconcileEntries(entries, fills, 'batch-test');
        expect(updates).toHaveLength(0);
    });

    test('extracts stopLoss from invalidation field', () => {
        const entries = [makeEntry({
            status: 'ENTERED',
            invalidation: '145.50',
        })];
        const fills = [
            makeFill({ side: 'buy', price: 150, filledAt: '2026-02-10T10:00:00Z', tradeId: 't1' }),
            makeFill({ side: 'sell', price: 160, filledAt: '2026-02-10T15:00:00Z', tradeId: 't2' }),
        ];

        const updates = reconcileEntries(entries, fills, 'batch-test');
        expect(updates).toHaveLength(1);
        // Risk = 150 - 145.50 = 4.50, Reward per share = (realized 1000) / 100 = 10
        // R = 10/4.5 = 2.22
        expect(updates[0].updates.r_multiple).toBe(2.22);
    });
});

// =============================================================================
// G) Reversal Detection
// =============================================================================

describe('reconcileEntries — reversal detection', () => {
    test('AMBIGUOUS_REVERSAL when exit qty overshoots entry qty', () => {
        const entries = [makeEntry({ status: 'ENTERED', trade_direction: 'LONG' })];
        const fills = [
            makeFill({ side: 'buy', qty: 100, price: 150, tradeId: 't1', filledAt: '2026-02-10T10:00:00Z' }),
            // Sells 200 shares — overshoots the 100 share entry
            makeFill({ side: 'sell', qty: 200, price: 155, tradeId: 't2', filledAt: '2026-02-10T15:00:00Z' }),
        ];

        const updates = reconcileEntries(entries, fills, 'batch-rev');
        expect(updates).toHaveLength(1);
        expect(updates[0].reconcileStatus).toBe('AMBIGUOUS_REVERSAL');
        expect(updates[0].matchExplanation.some(e => e.includes('exit qty') || e.includes('Exit qty'))).toBe(true);
        // Should NOT auto-set status to EXITED
        expect(updates[0].updates.status).toBeUndefined();
    });

    test('no reversal when exit qty equals entry qty', () => {
        const entries = [makeEntry({ status: 'ENTERED', trade_direction: 'LONG' })];
        const fills = [
            makeFill({ side: 'buy', qty: 100, price: 150, tradeId: 't1' }),
            makeFill({ side: 'sell', qty: 100, price: 155, tradeId: 't2', filledAt: '2026-02-10T15:00:00Z' }),
        ];

        const updates = reconcileEntries(entries, fills, 'batch-test');
        expect(updates).toHaveLength(1);
        expect(updates[0].reconcileStatus).toBe('MATCHED');
    });

    test('no reversal with 5% tolerance (exit 105 shares on 100)', () => {
        const entries = [makeEntry({ status: 'ENTERED', trade_direction: 'LONG' })];
        const fills = [
            makeFill({ side: 'buy', qty: 100, price: 150, tradeId: 't1' }),
            // 105 = 100 * 1.05, exactly at tolerance
            makeFill({ side: 'sell', qty: 105, price: 155, tradeId: 't2', filledAt: '2026-02-10T15:00:00Z' }),
        ];

        const updates = reconcileEntries(entries, fills, 'batch-test');
        expect(updates).toHaveLength(1);
        // Should NOT be reversal (at boundary)
        expect(updates[0].reconcileStatus).toBe('MATCHED');
    });
});

// =============================================================================
// H) Options Reconciliation
// =============================================================================

import { reconcileOptionsEntries, type ReconcilableOptionsEntry } from '../reconcile-engine';
import type { OptionsFillGroup } from '../options-fill-grouper';

function makeOptionsEntry(overrides: Partial<ReconcilableOptionsEntry> = {}): ReconcilableOptionsEntry {
    return {
        id: 'opt-entry-1',
        symbol: 'AAPL',
        status: 'ENTERED',
        manual_override: false,
        entry_fill_id: null,
        exit_fill_id: null,
        total_qty: null,
        exited_qty: null,
        net_debit_credit: null,
        ...overrides,
    };
}

function makeGroup(overrides: Partial<OptionsFillGroup> = {}): OptionsFillGroup {
    return {
        groupId: 'optgrp:AAPL:2026-02-10T14:30:00Z:f1',
        underlying: 'AAPL',
        expiration: '2026-03-21',
        direction: 'DEBIT',
        legs: [{
            fillId: 'f1',
            symbol: 'AAPL260321C00150000',
            underlying: 'AAPL',
            strike: 150,
            expiration: '2026-03-21',
            callPut: 'call',
            side: 'buy',
            qty: 1,
            price: 5.00,
            filledAt: '2026-02-10T14:30:00Z',
            orderId: 'ord-1',
        }],
        netCashflow: -500,
        totalContracts: 1,
        filledAt: '2026-02-10T14:30:00Z',
        ...overrides,
    };
}

describe('reconcileOptionsEntries', () => {
    test('MATCHED: entry + exit group computes PnL', () => {
        const entries = [makeOptionsEntry({ symbol: 'AAPL', status: 'ENTERED' })];
        const groups: OptionsFillGroup[] = [
            makeGroup({ netCashflow: -500, totalContracts: 1, filledAt: '2026-02-10T14:30:00Z' }),
            makeGroup({
                groupId: 'optgrp:AAPL:2026-02-10T15:30:00Z:f2',
                netCashflow: 750,
                totalContracts: 1,
                filledAt: '2026-02-10T15:30:00Z',
                legs: [{
                    fillId: 'f2', symbol: 'AAPL260321C00150000', underlying: 'AAPL',
                    strike: 150, expiration: '2026-03-21', callPut: 'call', side: 'sell',
                    qty: 1, price: 7.50, filledAt: '2026-02-10T15:30:00Z', orderId: 'ord-2',
                }],
            }),
        ];

        const updates = reconcileOptionsEntries(entries, groups, 'batch-opt');
        expect(updates).toHaveLength(1);
        expect(updates[0].reconcileStatus).toBe('MATCHED');
        expect(updates[0].updates.realized_pnl_dollars).toBe(250); // -500 + 750
        expect(updates[0].updates.status).toBe('EXITED');
        expect(updates[0].updates.result).toBe('WIN');
    });

    test('NONE when no exit groups', () => {
        const entries = [makeOptionsEntry({ symbol: 'AAPL', status: 'ENTERED' })];
        const groups: OptionsFillGroup[] = [
            makeGroup({ netCashflow: -500, totalContracts: 1 }),
        ];

        const updates = reconcileOptionsEntries(entries, groups, 'batch-opt');
        expect(updates).toHaveLength(1);
        expect(updates[0].reconcileStatus).toBe('NONE');
        expect(updates[0].updates.net_debit_credit).toBe(-500);
    });

    test('BLOCKED_MANUAL_OVERRIDE', () => {
        const entries = [makeOptionsEntry({ manual_override: true, status: 'ENTERED' })];
        const groups: OptionsFillGroup[] = [makeGroup()];

        const updates = reconcileOptionsEntries(entries, groups, 'batch-opt');
        expect(updates).toHaveLength(1);
        expect(updates[0].reconcileStatus).toBe('BLOCKED_MANUAL_OVERRIDE');
    });

    test('NONE when underlying does not match', () => {
        const entries = [makeOptionsEntry({ symbol: 'TSLA', status: 'ENTERED' })];
        const groups: OptionsFillGroup[] = [makeGroup({ underlying: 'AAPL' })];

        const updates = reconcileOptionsEntries(entries, groups, 'batch-opt');
        expect(updates).toHaveLength(1);
        expect(updates[0].reconcileStatus).toBe('NONE');
    });

    test('skips EXITED entries', () => {
        const entries = [makeOptionsEntry({ status: 'EXITED' })];
        const groups: OptionsFillGroup[] = [makeGroup()];

        const updates = reconcileOptionsEntries(entries, groups, 'batch-opt');
        expect(updates).toHaveLength(0);
    });

    test('LOSS when exit cashflow is less than entry debit', () => {
        const entries = [makeOptionsEntry({ symbol: 'AAPL', status: 'ENTERED' })];
        const groups: OptionsFillGroup[] = [
            makeGroup({ netCashflow: -500, totalContracts: 1, filledAt: '2026-02-10T14:30:00Z' }),
            makeGroup({
                groupId: 'optgrp:AAPL:exit',
                netCashflow: 200,
                totalContracts: 1,
                filledAt: '2026-02-10T15:30:00Z',
                legs: [{
                    fillId: 'f2', symbol: 'AAPL260321C00150000', underlying: 'AAPL',
                    strike: 150, expiration: '2026-03-21', callPut: 'call', side: 'sell',
                    qty: 1, price: 2.00, filledAt: '2026-02-10T15:30:00Z', orderId: 'ord-2',
                }],
            }),
        ];

        const updates = reconcileOptionsEntries(entries, groups, 'batch-opt');
        expect(updates[0].updates.realized_pnl_dollars).toBe(-300); // -500 + 200
        expect(updates[0].updates.result).toBe('LOSS');
    });
});
