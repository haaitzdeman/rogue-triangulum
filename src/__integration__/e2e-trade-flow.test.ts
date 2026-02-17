/**
 * E2E Trade Flow Integration Tests
 *
 * Validates the full pipeline:
 *   broker fills → journal link → reconciliation → ledger write → risk state → daily summary
 *
 * Mock boundary:
 *   - `untypedFrom` (DB layer) → stateful in-memory MockDB
 *   - `writeLedgerEntry` → tracked spy (real calls intercepted)
 *   - `isServerSupabaseConfigured` / `createServerSupabase` → always returns true / mock
 *
 * NOT mocked:
 *   - reconcileEntries / reconcileOptionsEntries (real logic)
 *   - matchFillsWithExplanation (real logic)
 *   - computeOutcome / computeVWAP (real logic)
 *   - groupOptionsFills (real logic)
 */

import type { BrokerFill } from '@/lib/broker/types';
import { computeDailyRiskState, type RiskEntry, type RiskConfig } from '@/lib/risk/risk-engine';
import { loadDailySummary, loadRealizedPnLForDate, type LedgerEntryParams } from '@/lib/accounting/trade-ledger-store';

// =============================================================================
// Stateful MockDB
// =============================================================================

interface MockRow {
    [key: string]: unknown;
}

class MockDB {
    tables: Record<string, MockRow[]> = {};
    ledgerWrites: LedgerEntryParams[] = [];

    seed(table: string, rows: MockRow[]) {
        this.tables[table] = [...rows];
    }

    getRows(table: string): MockRow[] {
        return this.tables[table] ?? [];
    }

    /**
     * Build a fluent chain that mimics Supabase query API.
     * Tracks filters and resolves from in-memory store.
     */
    chainFor(table: string) {
        const tables = this.tables;
        const filters: { column: string; op: string; value: unknown }[] = [];
        let limitVal: number | null = null;
        let pendingUpdate: MockRow | null = null;

        const chain: Record<string, unknown> = {};;

        const resolve = (): MockRow[] => {
            let rows = [...(tables[table] ?? [])];
            for (const f of filters) {
                if (f.op === 'eq') {
                    rows = rows.filter(r => String(r[f.column]).toUpperCase() === String(f.value).toUpperCase());
                } else if (f.op === 'in') {
                    const vals = (f.value as string[]).map(v => v.toUpperCase());
                    rows = rows.filter(r => vals.includes(String(r[f.column]).toUpperCase()));
                } else if (f.op === 'gte') {
                    rows = rows.filter(r => String(r[f.column]) >= String(f.value));
                } else if (f.op === 'lte') {
                    rows = rows.filter(r => String(r[f.column]) <= String(f.value));
                }
            }
            if (limitVal != null) rows = rows.slice(0, limitVal);
            return rows;
        };

        // Select columns
        chain.select = jest.fn((..._args: string[]) => {
            return chain;
        });

        // Filters
        chain.eq = jest.fn((col: string, val: unknown) => {
            filters.push({ column: col, op: 'eq', value: val });
            // If this is an update chain, apply and return result
            if (pendingUpdate) {
                const rows = resolve();
                for (const row of rows) {
                    Object.assign(row, pendingUpdate);
                }
                return Promise.resolve({ data: rows, error: null });
            }
            return chain;
        });

        chain.in = jest.fn((col: string, vals: unknown[]) => {
            filters.push({ column: col, op: 'in', value: vals });
            return chain;
        });

        chain.gte = jest.fn((col: string, val: unknown) => {
            filters.push({ column: col, op: 'gte', value: val });
            return chain;
        });

        chain.lte = jest.fn((col: string, val: unknown) => {
            filters.push({ column: col, op: 'lte', value: val });
            return chain;
        });

        chain.limit = jest.fn((n: number) => {
            limitVal = n;
            return chain;
        });

        chain.maybeSingle = jest.fn(() => {
            const rows = resolve();
            return Promise.resolve({ data: rows[0] ?? null, error: null });
        });

        // Update
        chain.update = jest.fn((data: MockRow) => {
            pendingUpdate = data;
            return chain;
        });

        // Insert
        chain.insert = jest.fn((data: MockRow | MockRow[]) => {
            const rows = Array.isArray(data) ? data : [data];
            for (const row of rows) {
                if (!row.id) row.id = `mock-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
                if (!tables[table]) tables[table] = [];
                tables[table].push({ ...row });
            }
            return Promise.resolve({ data: rows, error: null });
        });

        // Make chain thenable so `await chain.select().in().in()` works
        chain.then = jest.fn((onFulfill?: (v: unknown) => unknown, onReject?: (e: unknown) => unknown) => {
            const result = { data: resolve(), error: null };
            return Promise.resolve(result).then(onFulfill, onReject);
        });

        return chain;
    }
}

// =============================================================================
// Mocks Setup
// =============================================================================

let mockDB: MockDB;

// Mock untypedFrom to use our MockDB
jest.mock('@/lib/supabase/untyped', () => ({
    untypedFrom: jest.fn((table: string) => mockDB.chainFor(table)),
}));

// Mock server Supabase
jest.mock('@/lib/supabase/server', () => ({
    isServerSupabaseConfigured: jest.fn(() => true),
    createServerSupabase: jest.fn(() => ({})),
}));

// Track ledger writes but let real logic determine when to call
const ledgerWriteSpy = jest.fn(async (_supabase: unknown, params: LedgerEntryParams) => {
    mockDB.ledgerWrites.push(params);
    return { written: true };
});

jest.mock('@/lib/accounting/trade-ledger-store', () => {
    const actual = jest.requireActual('@/lib/accounting/trade-ledger-store');
    return {
        ...actual,
        writeLedgerEntry: (...args: unknown[]) => ledgerWriteSpy(args[0], args[1] as LedgerEntryParams),
    };
});

// Must import AFTER mocks are set up
import { linkFillsToJournal } from '@/lib/broker/journal-linker';
import { untypedFrom } from '@/lib/supabase/untyped';

// =============================================================================
// Helpers
// =============================================================================

function makeEntryFill(overrides: Partial<BrokerFill> & { symbol: string }): BrokerFill {
    return {
        broker: 'alpaca',
        side: 'buy',
        qty: 100,
        price: 150,
        filledAt: '2026-02-12T09:35:00Z',
        assetClass: 'stock',
        orderId: `order-${Math.random().toString(36).slice(2, 8)}`,
        tradeId: `trade-${Math.random().toString(36).slice(2, 8)}`,
        ...overrides,
    };
}

function makeExitFill(overrides: Partial<BrokerFill> & { symbol: string }): BrokerFill {
    return {
        broker: 'alpaca',
        side: 'sell',
        qty: 100,
        price: 160,
        filledAt: '2026-02-12T15:30:00Z',
        assetClass: 'stock',
        orderId: `order-${Math.random().toString(36).slice(2, 8)}`,
        tradeId: `trade-${Math.random().toString(36).slice(2, 8)}`,
        ...overrides,
    };
}

function makeJournalEntry(overrides: Partial<MockRow> = {}): MockRow {
    return {
        id: `entry-${Math.random().toString(36).slice(2, 8)}`,
        symbol: 'AAPL',
        effective_date: '2026-02-12',
        status: 'ENTERED',
        trade_direction: 'LONG',
        entry_price: 150,
        exit_price: null,
        size: 100,
        invalidation: null,
        key_levels: null,
        manual_override: false,
        entry_fill_id: 'alpaca:trade-entry-01',
        exit_fill_id: null,
        avg_entry_price: null,
        total_qty: null,
        exited_qty: null,
        realized_pnl_dollars: null,
        outcome: null,
        user_note: null,
        ...overrides,
    };
}

const RISK_CONFIG: RiskConfig = {
    dailyMaxLoss: 1000,
    dailyProfitTarget: 2000,
    perTradeMaxRisk: 300,
    maxOpenPositions: 5,
};

// =============================================================================
// Scenario 1: LONG Premarket — Full Lifecycle
// =============================================================================

describe('E2E: LONG premarket trade lifecycle', () => {
    let entryId: string;

    beforeEach(() => {
        mockDB = new MockDB();
        ledgerWriteSpy.mockClear();
        (untypedFrom as jest.Mock).mockImplementation((table: string) => mockDB.chainFor(table));
        entryId = 'entry-long-001';
    });

    test('Phase 1: Entry fill → status = ENTERED, no ledger row', async () => {
        // Seed ENTERED entry (already planned + had entry fill set status to ENTERED)
        const entry = makeJournalEntry({
            id: entryId,
            symbol: 'AAPL',
            status: 'ENTERED',
            trade_direction: 'LONG',
            entry_price: 150,
            size: 100,
        });
        mockDB.seed('premarket_journal_entries', [entry]);

        const fills: BrokerFill[] = [
            makeEntryFill({ symbol: 'AAPL', price: 150, qty: 100, side: 'buy' }),
        ];

        await linkFillsToJournal(fills, 'batch-long-1');

        // Entry should not be EXITED (no exit fills)
        const updatedEntry = mockDB.getRows('premarket_journal_entries').find(r => r.id === entryId);
        expect(updatedEntry).toBeDefined();
        expect(updatedEntry!.status).not.toBe('EXITED');

        // No ledger write
        expect(ledgerWriteSpy).not.toHaveBeenCalled();
    });

    test('Phase 2: Exit fill → EXITED, ledger row created, no duplicate on re-run', async () => {
        const entry = makeJournalEntry({
            id: entryId,
            symbol: 'AAPL',
            status: 'ENTERED',
            trade_direction: 'LONG',
            entry_price: 150,
            size: 100,
            entry_fill_id: 'alpaca:trade-entry-01',
        });
        mockDB.seed('premarket_journal_entries', [entry]);

        const entryFill = makeEntryFill({
            symbol: 'AAPL', price: 150, qty: 100, side: 'buy',
            tradeId: 'trade-entry-01',
        });
        const exitFill = makeExitFill({
            symbol: 'AAPL', price: 160, qty: 100, side: 'sell',
            tradeId: 'trade-exit-01',
        });

        await linkFillsToJournal([entryFill, exitFill], 'batch-long-2');

        // Entry should be EXITED
        const updatedEntry = mockDB.getRows('premarket_journal_entries').find(r => r.id === entryId);
        expect(updatedEntry!.status).toBe('EXITED');

        // Ledger row written
        expect(ledgerWriteSpy).toHaveBeenCalledTimes(1);
        const ledgerCall = ledgerWriteSpy.mock.calls[0][1] as LedgerEntryParams;
        expect(ledgerCall.desk).toBe('PREMARKET');
        expect(ledgerCall.symbol).toBe('AAPL');
        expect(ledgerCall.entryId).toBe(entryId);
        expect(ledgerCall.realizedPnl).toBe(1000); // (160-150) * 100

        // Re-run should not create duplicate ledger (entry is now EXITED, reconcile skips it)
        ledgerWriteSpy.mockClear();
        await linkFillsToJournal([entryFill, exitFill], 'batch-long-3');
        expect(ledgerWriteSpy).not.toHaveBeenCalled();
    });

    test('Phase 3: Risk state uses ledger realized PnL', () => {
        const entries: RiskEntry[] = [
            {
                id: entryId,
                symbol: 'AAPL',
                status: 'EXITED',
                realized_pnl_dollars: 999, // Journal says $999
                entry_price: 150,
                exit_price: 160,
                size: 100,
                total_qty: 100,
                trade_direction: 'LONG',
                unrealized_pnl_dollars: null,
                current_price: null,
            },
        ];

        // Ledger says $1000 — ledger wins
        const state = computeDailyRiskState(entries, RISK_CONFIG, { ledgerRealizedPnl: 1000 });
        expect(state.realizedPnl).toBe(1000);
        expect(state.openPositions).toBe(0);
    });

    test('Phase 4: Daily summary from ledger', async () => {
        // Mock Supabase client for loadDailySummary
        const mockCalls: Record<string, jest.Mock> = {};
        mockCalls.from = jest.fn(() => mockCalls);
        mockCalls.select = jest.fn(() => mockCalls);
        mockCalls.gte = jest.fn(() => mockCalls);
        mockCalls.lte = jest.fn(() => Promise.resolve({
            data: [
                { symbol: 'AAPL', realized_pnl: 1000, r_multiple: 2.5 },
            ],
            error: null,
        }));

        const summary = await loadDailySummary(
            mockCalls as unknown as import('@supabase/supabase-js').SupabaseClient,
            '2026-02-12',
        );

        expect(summary.tradeCount).toBe(1);
        expect(summary.realizedPnl).toBe(1000);
        expect(summary.winRate).toBe(1); // 1 win / 1 trade
        expect(summary.avgR).toBe(2.5);
        expect(summary.symbols).toEqual(['AAPL']);
    });
});

// =============================================================================
// Scenario 2: SHORT Premarket Trade
// =============================================================================

describe('E2E: SHORT premarket trade lifecycle', () => {
    const entryId = 'entry-short-001';

    beforeEach(() => {
        mockDB = new MockDB();
        ledgerWriteSpy.mockClear();
        (untypedFrom as jest.Mock).mockImplementation((table: string) => mockDB.chainFor(table));
    });

    test('SHORT exit fill → EXITED with correct PnL (entry-exit)*qty', async () => {
        const entry = makeJournalEntry({
            id: entryId,
            symbol: 'TSLA',
            status: 'ENTERED',
            trade_direction: 'SHORT',
            entry_price: 200,
            size: 50,
            entry_fill_id: 'alpaca:trade-short-entry',
        });
        mockDB.seed('premarket_journal_entries', [entry]);

        const entryFill = makeEntryFill({
            symbol: 'TSLA', price: 200, qty: 50, side: 'sell',
            tradeId: 'trade-short-entry',
        });
        const exitFill = makeExitFill({
            symbol: 'TSLA', price: 190, qty: 50, side: 'buy',
            tradeId: 'trade-short-exit',
        });

        await linkFillsToJournal([entryFill, exitFill], 'batch-short-1');

        const updatedEntry = mockDB.getRows('premarket_journal_entries').find(r => r.id === entryId);
        expect(updatedEntry!.status).toBe('EXITED');

        // Ledger: SHORT PnL = (200-190) * 50 = $500
        expect(ledgerWriteSpy).toHaveBeenCalledTimes(1);
        const ledgerCall = ledgerWriteSpy.mock.calls[0][1] as LedgerEntryParams;
        expect(ledgerCall.desk).toBe('PREMARKET');
        expect(ledgerCall.symbol).toBe('TSLA');
        expect(ledgerCall.realizedPnl).toBe(500);
    });
});

// =============================================================================
// Scenario 3: Options Multi-Leg Spread
// =============================================================================

describe('E2E: Options multi-leg spread lifecycle', () => {
    const entryId = 'entry-opts-001';

    beforeEach(() => {
        mockDB = new MockDB();
        ledgerWriteSpy.mockClear();
        (untypedFrom as jest.Mock).mockImplementation((table: string) => mockDB.chainFor(table));
    });

    test('Options spread entry+exit → EXITED, ledger row with realized PnL', async () => {
        // Seed options journal entry
        const entry: MockRow = {
            id: entryId,
            symbol: 'AAPL',
            status: 'ENTERED',
            scanned_at: '2026-02-12T09:30:00Z',
            selected_contract: { symbol: 'AAPL260320C150', strike: 150, expiration: '2026-03-20', type: 'call' },
            is_spread: false,
            legs_json: null,
            manual_override: false,
            entry_fill_id: 'alpaca:opt-entry-01',
            exit_fill_id: null,
            total_qty: null,
            exited_qty: null,
            net_debit_credit: null,
        };
        mockDB.seed('options_journal_entries', [entry]);

        // Import options linker
        const { linkFillsToOptionsJournal } = await import('@/lib/broker/journal-linker');

        // Entry fills (buy call)
        const entryFill: BrokerFill = {
            broker: 'alpaca',
            symbol: 'AAPL260320C00150000',
            side: 'buy',
            qty: 2,
            price: 5.00, // $5 per contract
            filledAt: '2026-02-12T09:35:00Z',
            assetClass: 'option',
            underlyingSymbol: 'AAPL',
            expiration: '2026-03-20',
            strike: 150,
            callPut: 'call',
            orderId: 'order-opt-01',
            tradeId: 'opt-entry-01',
        };

        // Exit fills (sell call for profit)
        const exitFill: BrokerFill = {
            broker: 'alpaca',
            symbol: 'AAPL260320C00150000',
            side: 'sell',
            qty: 2,
            price: 8.00, // $8 per contract → $600 profit
            filledAt: '2026-02-12T15:00:00Z',
            assetClass: 'option',
            underlyingSymbol: 'AAPL',
            expiration: '2026-03-20',
            strike: 150,
            callPut: 'call',
            orderId: 'order-opt-02',
            tradeId: 'opt-exit-01',
        };

        await linkFillsToOptionsJournal([entryFill, exitFill], 'batch-opts-1');

        const updatedEntry = mockDB.getRows('options_journal_entries').find(r => r.id === entryId);
        expect(updatedEntry!.status).toBe('EXITED');

        // Ledger write for options desk
        expect(ledgerWriteSpy).toHaveBeenCalledTimes(1);
        const ledgerCall = ledgerWriteSpy.mock.calls[0][1] as LedgerEntryParams;
        expect(ledgerCall.desk).toBe('OPTIONS');
        expect(ledgerCall.symbol).toBe('AAPL');
        // PnL: sell $8*2*100 - buy $5*2*100 = $1600 - $1000 = $600
        expect(ledgerCall.realizedPnl).toBe(600);
    });
});

// =============================================================================
// Scenario 4: Scale-In Partial Exit
// =============================================================================

describe('E2E: Scale-in partial exit lifecycle', () => {
    const entryId = 'entry-scale-001';

    beforeEach(() => {
        mockDB = new MockDB();
        ledgerWriteSpy.mockClear();
        (untypedFrom as jest.Mock).mockImplementation((table: string) => mockDB.chainFor(table));
    });

    test('2 entry fills, partial exit → PARTIAL (no ledger), then full exit → EXITED + ledger', async () => {
        // Seed ENTERED entry with 2 scale fills
        const entry = makeJournalEntry({
            id: entryId,
            symbol: 'NVDA',
            status: 'ENTERED',
            trade_direction: 'LONG',
            entry_price: 100,
            size: 200,
            entry_fill_id: 'alpaca:scale-entry-1,alpaca:scale-entry-2',
        });
        mockDB.seed('premarket_journal_entries', [entry]);

        // Scale-in fills at $100 and $105, 100 shares each → VWAP = $102.50
        const entryFill1 = makeEntryFill({
            symbol: 'NVDA', price: 100, qty: 100, side: 'buy',
            tradeId: 'scale-entry-1',
            filledAt: '2026-02-12T09:35:00Z',
        });
        const entryFill2 = makeEntryFill({
            symbol: 'NVDA', price: 105, qty: 100, side: 'buy',
            tradeId: 'scale-entry-2',
            filledAt: '2026-02-12T10:00:00Z',
        });

        // Partial exit: sell 100 of 200
        const partialExit = makeExitFill({
            symbol: 'NVDA', price: 110, qty: 100, side: 'sell',
            tradeId: 'scale-exit-1',
            filledAt: '2026-02-12T13:00:00Z',
        });

        await linkFillsToJournal([entryFill1, entryFill2, partialExit], 'batch-scale-1');

        const afterPartial = mockDB.getRows('premarket_journal_entries').find(r => r.id === entryId);
        // PARTIAL — not fully exited
        expect(afterPartial!.status).not.toBe('EXITED');
        // No ledger write for partial
        expect(ledgerWriteSpy).not.toHaveBeenCalled();

        // Now full exit: sell remaining 100
        const fullExit = makeExitFill({
            symbol: 'NVDA', price: 115, qty: 100, side: 'sell',
            tradeId: 'scale-exit-2',
            filledAt: '2026-02-12T15:00:00Z',
        });

        await linkFillsToJournal(
            [entryFill1, entryFill2, partialExit, fullExit],
            'batch-scale-2',
        );

        const afterFull = mockDB.getRows('premarket_journal_entries').find(r => r.id === entryId);
        expect(afterFull!.status).toBe('EXITED');

        // Ledger written once
        expect(ledgerWriteSpy).toHaveBeenCalledTimes(1);
        const ledgerCall = ledgerWriteSpy.mock.calls[0][1] as LedgerEntryParams;
        expect(ledgerCall.desk).toBe('PREMARKET');
        expect(ledgerCall.symbol).toBe('NVDA');
        // VWAP = (100*100 + 105*100) / 200 = 102.50
        // Realized = (110-102.50)*100 + (115-102.50)*100 = 750 + 1250 = 2000
        expect(ledgerCall.realizedPnl).toBe(2000);
    });
});

// =============================================================================
// Scenario 5: Reversal Detection — No Ledger Write
// =============================================================================

describe('E2E: Reversal detection (no ledger write)', () => {
    const entryId = 'entry-reversal-001';

    beforeEach(() => {
        mockDB = new MockDB();
        ledgerWriteSpy.mockClear();
        (untypedFrom as jest.Mock).mockImplementation((table: string) => mockDB.chainFor(table));
    });

    test('Exit qty > entry qty → AMBIGUOUS_REVERSAL, no EXITED, no ledger', async () => {
        const entry = makeJournalEntry({
            id: entryId,
            symbol: 'SPY',
            status: 'ENTERED',
            trade_direction: 'LONG',
            entry_price: 500,
            size: 100,
            entry_fill_id: 'alpaca:rev-entry',
        });
        mockDB.seed('premarket_journal_entries', [entry]);

        const entryFill = makeEntryFill({
            symbol: 'SPY', price: 500, qty: 100, side: 'buy',
            tradeId: 'rev-entry',
            filledAt: '2026-02-12T09:35:00Z',
        });

        // Exit 200 shares (2x the entry) — clear reversal signal
        const reversalExit = makeExitFill({
            symbol: 'SPY', price: 505, qty: 200, side: 'sell',
            tradeId: 'rev-exit',
            filledAt: '2026-02-12T14:00:00Z',
        });

        await linkFillsToJournal([entryFill, reversalExit], 'batch-reversal');

        const updatedEntry = mockDB.getRows('premarket_journal_entries').find(r => r.id === entryId);

        // Should NOT be EXITED — reversal blocks it
        expect(updatedEntry!.status).not.toBe('EXITED');

        // Should have AMBIGUOUS_REVERSAL status
        expect(updatedEntry!.reconcile_status).toBe('AMBIGUOUS_REVERSAL');

        // NO ledger write
        expect(ledgerWriteSpy).not.toHaveBeenCalled();
    });
});

// =============================================================================
// Scenario 6: Risk State + Daily Summary Downstream Integration
// =============================================================================

describe('E2E: Downstream verification — risk state + daily summary', () => {
    test('Risk state: ledger PnL overrides journal, unrealized still works', () => {
        const entries: RiskEntry[] = [
            // EXITED trade (journal says $800, ledger says $1000)
            {
                id: 'e1', symbol: 'AAPL', status: 'EXITED',
                realized_pnl_dollars: 800,
                entry_price: 150, exit_price: 160, size: 100,
                total_qty: 100, trade_direction: 'LONG',
                unrealized_pnl_dollars: null, current_price: null,
            },
            // Open position with unrealized PnL
            {
                id: 'e2', symbol: 'TSLA', status: 'ENTERED',
                realized_pnl_dollars: null,
                entry_price: 200, exit_price: null, size: 50,
                total_qty: 50, trade_direction: 'LONG',
                unrealized_pnl_dollars: -150, current_price: 197,
            },
        ];

        const state = computeDailyRiskState(entries, RISK_CONFIG, { ledgerRealizedPnl: 1000 });

        // Realized from ledger, not journal
        expect(state.realizedPnl).toBe(1000);
        // Unrealized from journal
        expect(state.unrealizedPnl).toBe(-150);
        // Total
        expect(state.totalPnl).toBe(850);
        // Only ENTERED counts as open
        expect(state.openPositions).toBe(1);
    });

    test('Daily summary: multi-trade day aggregation', async () => {
        // Mock supabase for loadDailySummary
        const chain: Record<string, jest.Mock> = {};
        chain.from = jest.fn(() => chain);
        chain.select = jest.fn(() => chain);
        chain.gte = jest.fn(() => chain);
        chain.lte = jest.fn(() => Promise.resolve({
            data: [
                { symbol: 'AAPL', realized_pnl: 1000, r_multiple: 2.5 },
                { symbol: 'TSLA', realized_pnl: -200, r_multiple: -0.8 },
                { symbol: 'SPY', realized_pnl: 500, r_multiple: 1.5 },
            ],
            error: null,
        }));

        const summary = await loadDailySummary(
            chain as unknown as import('@supabase/supabase-js').SupabaseClient,
            '2026-02-12',
        );

        expect(summary.tradeCount).toBe(3);
        expect(summary.realizedPnl).toBe(1300); // 1000 + (-200) + 500
        expect(summary.winRate).toBeCloseTo(2 / 3); // 2 wins, 1 loss
        expect(summary.avgR).toBeCloseTo((2.5 + -0.8 + 1.5) / 3);
        expect(summary.symbols).toEqual(['AAPL', 'SPY', 'TSLA']); // sorted
    });

    test('loadRealizedPnLForDate sums correctly', async () => {
        const chain: Record<string, jest.Mock> = {};
        chain.from = jest.fn(() => chain);
        chain.select = jest.fn(() => chain);
        chain.gte = jest.fn(() => chain);
        chain.lte = jest.fn(() => Promise.resolve({
            data: [
                { realized_pnl: 1000 },
                { realized_pnl: -200 },
                { realized_pnl: 500 },
            ],
            error: null,
        }));

        const total = await loadRealizedPnLForDate(
            chain as unknown as import('@supabase/supabase-js').SupabaseClient,
            '2026-02-12',
        );

        expect(total).toBe(1300);
    });
});
