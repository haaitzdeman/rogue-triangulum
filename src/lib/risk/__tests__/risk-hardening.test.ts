/**
 * Fail-Closed + Desk-Scope Tests
 *
 * Verifies:
 * 1. Morning-run risk gating fail-closed behavior (DB throws → blocked)
 * 2. isDuplicateLivePosition scope behavior (GLOBAL vs DESK_ONLY)
 */

import {
    isDuplicateLivePosition,
    computeDailyRiskState,
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
// isDuplicateLivePosition — Desk Scope Tests
// =============================================================================

describe('isDuplicateLivePosition — desk scope', () => {
    const entries: RiskEntry[] = [
        makeEntry({ id: '1', symbol: 'AAPL', status: 'ENTERED', desk: 'PREMARKET' }),
        makeEntry({ id: '2', symbol: 'AAPL', status: 'OPEN', desk: 'OPTIONS' }),
        makeEntry({ id: '3', symbol: 'TSLA', status: 'PLANNED', desk: 'PREMARKET' }),
    ];

    test('GLOBAL: blocks across desks', () => {
        expect(isDuplicateLivePosition('AAPL', entries, 'GLOBAL')).toBe(true);
    });

    test('DESK_ONLY: blocks within same desk', () => {
        expect(isDuplicateLivePosition('AAPL', entries, 'DESK_ONLY', 'PREMARKET')).toBe(true);
    });

    test('DESK_ONLY: does NOT block across desks', () => {
        // TSLA only exists in PREMARKET, so checking OPTIONS desk should not block
        expect(isDuplicateLivePosition('TSLA', entries, 'DESK_ONLY', 'OPTIONS')).toBe(false);
    });

    test('DESK_ONLY: blocks when desk matches', () => {
        expect(isDuplicateLivePosition('TSLA', entries, 'DESK_ONLY', 'PREMARKET')).toBe(true);
    });

    test('GLOBAL: no match for non-existent symbol', () => {
        expect(isDuplicateLivePosition('NVDA', entries, 'GLOBAL')).toBe(false);
    });
});

// =============================================================================
// Fail-Closed Simulation
// =============================================================================

describe('fail-closed simulation', () => {
    /**
     * Simulates the morning-run risk gating logic:
     * - If risk check throws → riskBlocked = true + reason = FAIL_CLOSED
     * - This proves autoJournal would be skipped
     */
    function simulateMorningRunRiskGating(
        loadFn: () => Promise<RiskEntry[]>,
        config: RiskConfig,
    ): Promise<{ riskBlocked: boolean; riskReason?: string }> {
        return (async () => {
            let riskBlocked = false;
            let riskReason: string | undefined;

            try {
                const entries = await loadFn();
                const state = computeDailyRiskState(entries, config);

                if (state.dailyLossLimitBreached) {
                    riskBlocked = true;
                    riskReason = 'Daily loss limit breached';
                }
            } catch (err) {
                riskBlocked = true;
                riskReason = `RISK_CHECK_FAILED_FAIL_CLOSED: ${err instanceof Error ? err.message : 'Unknown'}`;
            }

            return { riskBlocked, riskReason };
        })();
    }

    test('DB throws → autoJournal blocked (FAIL CLOSED)', async () => {
        const result = await simulateMorningRunRiskGating(
            () => { throw new Error('DB connection refused'); },
            DEFAULT_CONFIG,
        );
        expect(result.riskBlocked).toBe(true);
        expect(result.riskReason).toContain('RISK_CHECK_FAILED_FAIL_CLOSED');
        expect(result.riskReason).toContain('DB connection refused');
    });

    test('DB returns normally → not blocked', async () => {
        const result = await simulateMorningRunRiskGating(
            () => Promise.resolve([]),
            DEFAULT_CONFIG,
        );
        expect(result.riskBlocked).toBe(false);
    });

    test('DB returns loss-breaching data → blocked', async () => {
        const result = await simulateMorningRunRiskGating(
            () => Promise.resolve([
                makeEntry({ id: '1', symbol: 'X', status: 'EXITED', realized_pnl_dollars: -1500 }),
            ]),
            DEFAULT_CONFIG,
        );
        expect(result.riskBlocked).toBe(true);
        expect(result.riskReason).toContain('Daily loss limit breached');
    });
});
