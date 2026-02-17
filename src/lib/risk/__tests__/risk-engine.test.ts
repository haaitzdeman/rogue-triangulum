import {
    computeDailyRiskState,
    canOpenNewPosition,
    isDuplicateLivePosition,
    type RiskEntry,
    type RiskConfig,
} from '../risk-engine';

// =============================================================================
// Fixtures
// =============================================================================

const DEFAULT_CONFIG: RiskConfig = {
    dailyMaxLoss: 1000,
    dailyProfitTarget: 2000,
    perTradeMaxRisk: 300,
    maxOpenPositions: 5,
};

function makeEntry(overrides: Partial<RiskEntry> & { id: string; symbol: string; status: string }): RiskEntry {
    return {
        entry_price: null,
        exit_price: null,
        size: null,
        total_qty: null,
        realized_pnl_dollars: null,
        unrealized_pnl_dollars: null,
        trade_direction: 'LONG',
        current_price: null,
        ...overrides,
    };
}

// =============================================================================
// computeDailyRiskState
// =============================================================================

describe('computeDailyRiskState', () => {
    test('empty entries → zeroed state', () => {
        const state = computeDailyRiskState([], DEFAULT_CONFIG);
        expect(state.realizedPnl).toBe(0);
        expect(state.unrealizedPnl).toBe(0);
        expect(state.totalPnl).toBe(0);
        expect(state.openPositions).toBe(0);
        expect(state.dailyLossLimitBreached).toBe(false);
        expect(state.dailyProfitTargetHit).toBe(false);
    });

    test('realized PnL from EXITED entry with realized_pnl_dollars', () => {
        const entries = [
            makeEntry({ id: '1', symbol: 'AAPL', status: 'EXITED', realized_pnl_dollars: 250 }),
        ];
        const state = computeDailyRiskState(entries, DEFAULT_CONFIG);
        expect(state.realizedPnl).toBe(250);
        expect(state.totalPnl).toBe(250);
        expect(state.openPositions).toBe(0);
    });

    test('realized PnL computed from entry/exit price for LONG', () => {
        const entries = [
            makeEntry({
                id: '1', symbol: 'AAPL', status: 'EXITED',
                entry_price: 100, exit_price: 110, total_qty: 10,
                trade_direction: 'LONG',
            }),
        ];
        const state = computeDailyRiskState(entries, DEFAULT_CONFIG);
        expect(state.realizedPnl).toBe(100); // (110-100)*10
    });

    test('realized PnL computed from entry/exit price for SHORT', () => {
        const entries = [
            makeEntry({
                id: '1', symbol: 'TSLA', status: 'CLOSED',
                entry_price: 200, exit_price: 190, total_qty: 5,
                trade_direction: 'SHORT',
            }),
        ];
        const state = computeDailyRiskState(entries, DEFAULT_CONFIG);
        expect(state.realizedPnl).toBe(50); // (200-190)*5
    });

    test('unrealized PnL from ENTERED entry with unrealized_pnl_dollars', () => {
        const entries = [
            makeEntry({ id: '1', symbol: 'NVDA', status: 'ENTERED', unrealized_pnl_dollars: -75 }),
        ];
        const state = computeDailyRiskState(entries, DEFAULT_CONFIG);
        expect(state.unrealizedPnl).toBe(-75);
        expect(state.openPositions).toBe(1);
    });

    test('unrealized PnL computed from current_price', () => {
        const entries = [
            makeEntry({
                id: '1', symbol: 'AMD', status: 'OPEN',
                entry_price: 150, current_price: 145, size: 20,
                trade_direction: 'LONG',
            }),
        ];
        const state = computeDailyRiskState(entries, DEFAULT_CONFIG);
        expect(state.unrealizedPnl).toBe(-100); // (145-150)*20
        expect(state.openPositions).toBe(1);
    });

    test('PLANNED entries count toward open positions but no PnL', () => {
        const entries = [
            makeEntry({ id: '1', symbol: 'SPY', status: 'PLANNED' }),
            makeEntry({ id: '2', symbol: 'QQQ', status: 'PLANNED' }),
        ];
        const state = computeDailyRiskState(entries, DEFAULT_CONFIG);
        expect(state.openPositions).toBe(2);
        expect(state.realizedPnl).toBe(0);
    });

    test('daily loss limit breached when totalPnl <= -dailyMaxLoss', () => {
        const entries = [
            makeEntry({ id: '1', symbol: 'AAPL', status: 'EXITED', realized_pnl_dollars: -500 }),
            makeEntry({ id: '2', symbol: 'TSLA', status: 'EXITED', realized_pnl_dollars: -600 }),
        ];
        const state = computeDailyRiskState(entries, DEFAULT_CONFIG);
        expect(state.totalPnl).toBe(-1100);
        expect(state.dailyLossLimitBreached).toBe(true);
    });

    test('daily loss limit NOT breached when totalPnl > -dailyMaxLoss', () => {
        const entries = [
            makeEntry({ id: '1', symbol: 'AAPL', status: 'EXITED', realized_pnl_dollars: -999 }),
        ];
        const state = computeDailyRiskState(entries, DEFAULT_CONFIG);
        expect(state.dailyLossLimitBreached).toBe(false);
    });

    test('daily profit target hit', () => {
        const entries = [
            makeEntry({ id: '1', symbol: 'NVDA', status: 'EXITED', realized_pnl_dollars: 2500 }),
        ];
        const state = computeDailyRiskState(entries, DEFAULT_CONFIG);
        expect(state.dailyProfitTargetHit).toBe(true);
    });

    test('mixed entries: realized + unrealized + planned', () => {
        const entries = [
            makeEntry({ id: '1', symbol: 'AAPL', status: 'EXITED', realized_pnl_dollars: 200 }),
            makeEntry({ id: '2', symbol: 'TSLA', status: 'ENTERED', unrealized_pnl_dollars: -50 }),
            makeEntry({ id: '3', symbol: 'SPY', status: 'PLANNED' }),
        ];
        const state = computeDailyRiskState(entries, DEFAULT_CONFIG);
        expect(state.realizedPnl).toBe(200);
        expect(state.unrealizedPnl).toBe(-50);
        expect(state.totalPnl).toBe(150);
        expect(state.openPositions).toBe(2);
    });

    test('ledgerRealizedPnl overrides journal-based realized PnL', () => {
        const entries = [
            makeEntry({ id: '1', symbol: 'AAPL', status: 'EXITED', realized_pnl_dollars: 200 }),
        ];
        // Ledger says $999 — journal says $200 — ledger wins
        const state = computeDailyRiskState(entries, DEFAULT_CONFIG, { ledgerRealizedPnl: 999 });
        expect(state.realizedPnl).toBe(999);
    });

    test('ledgerRealizedPnl skips journal EXITED entries entirely', () => {
        const entries = [
            makeEntry({ id: '1', symbol: 'AAPL', status: 'EXITED', realized_pnl_dollars: 500 }),
            makeEntry({ id: '2', symbol: 'TSLA', status: 'EXITED', realized_pnl_dollars: -300 }),
        ];
        // Journal sum would be 200, but ledger says 750
        const state = computeDailyRiskState(entries, DEFAULT_CONFIG, { ledgerRealizedPnl: 750 });
        expect(state.realizedPnl).toBe(750);
    });

    test('ledgerRealizedPnl still calculates unrealized from journals', () => {
        const entries = [
            makeEntry({ id: '1', symbol: 'AAPL', status: 'EXITED', realized_pnl_dollars: 500 }),
            makeEntry({ id: '2', symbol: 'TSLA', status: 'ENTERED', unrealized_pnl_dollars: -100 }),
        ];
        const state = computeDailyRiskState(entries, DEFAULT_CONFIG, { ledgerRealizedPnl: 300 });
        expect(state.realizedPnl).toBe(300);
        expect(state.unrealizedPnl).toBe(-100);
        expect(state.totalPnl).toBe(200); // 300 + (-100)
    });
});

// =============================================================================
// canOpenNewPosition
// =============================================================================

describe('canOpenNewPosition', () => {
    test('allowed: safe scenario', () => {
        const result = canOpenNewPosition({
            config: DEFAULT_CONFIG,
            currentDailyPnl: 0,
            openPositions: 0,
            proposedRisk: 100,
            dailyLossLimitBreached: false,
        });
        expect(result.allowed).toBe(true);
    });

    test('blocked: daily loss limit breached', () => {
        const result = canOpenNewPosition({
            config: DEFAULT_CONFIG,
            currentDailyPnl: -1100,
            openPositions: 0,
            proposedRisk: 100,
            dailyLossLimitBreached: true,
        });
        expect(result.allowed).toBe(false);
        expect(result.reason).toContain('Daily loss limit breached');
    });

    test('blocked: max open positions', () => {
        const result = canOpenNewPosition({
            config: DEFAULT_CONFIG,
            currentDailyPnl: 0,
            openPositions: 5,
            proposedRisk: 100,
            dailyLossLimitBreached: false,
        });
        expect(result.allowed).toBe(false);
        expect(result.reason).toContain('Max open positions');
    });

    test('blocked: per-trade risk exceeded', () => {
        const result = canOpenNewPosition({
            config: DEFAULT_CONFIG,
            currentDailyPnl: 0,
            openPositions: 0,
            proposedRisk: 500,
            dailyLossLimitBreached: false,
        });
        expect(result.allowed).toBe(false);
        expect(result.reason).toContain('Per-trade risk');
    });

    test('blocked: trade would push past daily limit', () => {
        const result = canOpenNewPosition({
            config: DEFAULT_CONFIG,
            currentDailyPnl: -800,
            openPositions: 0,
            proposedRisk: 250,
            dailyLossLimitBreached: false,
        });
        expect(result.allowed).toBe(false);
        expect(result.reason).toContain('would push daily PnL');
    });

    test('allowed: trade risk within daily limit headroom', () => {
        const result = canOpenNewPosition({
            config: DEFAULT_CONFIG,
            currentDailyPnl: -500,
            openPositions: 2,
            proposedRisk: 200,
            dailyLossLimitBreached: false,
        });
        expect(result.allowed).toBe(true);
    });
});

// =============================================================================
// isDuplicateLivePosition
// =============================================================================

describe('isDuplicateLivePosition', () => {
    test('no duplicate in empty entries', () => {
        expect(isDuplicateLivePosition('AAPL', [])).toBe(false);
    });

    test('detects duplicate ENTERED', () => {
        const entries = [makeEntry({ id: '1', symbol: 'AAPL', status: 'ENTERED' })];
        expect(isDuplicateLivePosition('AAPL', entries)).toBe(true);
    });

    test('detects duplicate PLANNED', () => {
        const entries = [makeEntry({ id: '1', symbol: 'aapl', status: 'PLANNED' })];
        expect(isDuplicateLivePosition('AAPL', entries)).toBe(true);
    });

    test('case-insensitive match', () => {
        const entries = [makeEntry({ id: '1', symbol: 'Tsla', status: 'OPEN' })];
        expect(isDuplicateLivePosition('tsla', entries)).toBe(true);
    });

    test('no duplicate: different symbol', () => {
        const entries = [makeEntry({ id: '1', symbol: 'AAPL', status: 'ENTERED' })];
        expect(isDuplicateLivePosition('TSLA', entries)).toBe(false);
    });

    test('no duplicate: EXITED entry does not block', () => {
        const entries = [makeEntry({ id: '1', symbol: 'AAPL', status: 'EXITED' })];
        expect(isDuplicateLivePosition('AAPL', entries)).toBe(false);
    });
});
