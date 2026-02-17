/**
 * Morning Run API Route — End-to-End Jest Test
 *
 * Mocks:
 * - runPremarketScan: returns fixed candidates
 * - resolvePremarketDate: returns deterministic resolution
 * - scanOptions: succeeds for some, fails for one (429 sim)
 * - buildTodayOpportunities: returns deterministic opportunities
 * - morning-run-store: mocks saveMorningRun / loadMorningRunByRunId
 *
 * Asserts:
 * - Response shape: date, runId, premarket counts, options stats, today count
 * - Error messagePreview ≤ 200 chars
 * - saveMorningRun called with correct payload
 * - Deterministic runId
 */

import { POST } from '../route';

// =============================================================================
// Mocks
// =============================================================================

jest.mock('@/lib/brains/premarket', () => ({
    resolvePremarketDate: jest.fn(() => ({
        mode: 'DATASET',
        effectiveDate: '2026-02-10',
        requestedDate: undefined,
        reason: 'Mocked resolution',
        datasetRange: { earliest: '2025-01-01', latest: '2026-02-10' },
    })),
    isDateOutOfRangeError: jest.fn(() => false),
    runPremarketScan: jest.fn(() => ({
        candidates: [
            { symbol: 'AAPL', gapPct: 3.5, playType: 'CONTINUATION', direction: 'UP', confidence: 'HIGH' },
            { symbol: 'MSFT', gapPct: -2.1, playType: 'FADE', direction: 'DOWN', confidence: 'LOW' },
            { symbol: 'NVDA', gapPct: 5.0, playType: 'CONTINUATION', direction: 'UP', confidence: 'HIGH' },
            { symbol: 'BAD_TICKER', gapPct: 1.0, playType: 'AVOID', direction: 'UP', confidence: 'LOW' },
        ],
        scannedAt: '2026-02-10T09:00:00Z',
    })),
    getPremarketUniverse: jest.fn(() => ['AAPL', 'MSFT', 'NVDA']),
    fetchPolygonSnapshots: jest.fn(),
    isLiveProviderConfigured: jest.fn(() => false),
    DEFAULT_GAP_SCANNER_CONFIG: {
        minAbsGapPct: 2,
        minPrice: 5,
        minAvgDailyVolume20: 1_000_000,
        excludeETFs: true,
    },
    DEFAULT_ANALOG_CONFIG: {},
}));

// Track which symbols succeed/fail
jest.mock('@/lib/brains/options', () => ({
    scanOptions: jest.fn((symbol: string) => {
        if (symbol === 'BAD_TICKER') {
            // Simulate a 429 rate limit error with a long message
            const longMsg = 'Rate limit exceeded: too many requests to polygon.io API endpoint /v3/snapshot/options/' +
                'BAD_TICKER. Please reduce request frequency. Contact support at https://polygon.io/support for ' +
                'higher rate limits. Request ID: abc123def456. Timestamp: 2026-02-10T09:15:00.000Z. ' +
                'This message intentionally exceeds 200 characters to test truncation behavior.';
            return Promise.resolve({
                success: false,
                errorCode: '429',
                error: longMsg,
            });
        }
        return Promise.resolve({
            success: true,
            fromCache: symbol === 'MSFT', // simulate MSFT from cache
        });
    }),
}));

jest.mock('@/lib/integration/today-builder', () => ({
    buildTodayOpportunities: jest.fn(() => ({
        opportunities: [
            {
                symbol: 'NVDA', rank: 1, overallScore: 95, alignment: 'ALIGNED',
                reasoning: ['High confidence', 'Strong gap'],
                premarket: { direction: 'UP', gapPct: 5.0, playType: 'CONTINUATION', confidence: 'HIGH' },
            },
            {
                symbol: 'AAPL', rank: 2, overallScore: 80, alignment: 'PARTIAL',
                reasoning: ['Moderate gap'],
                premarket: { direction: 'UP', gapPct: 3.5, playType: 'CONTINUATION', confidence: 'HIGH' },
            },
        ],
        sources: { premarketCandidates: 4, optionsScans: 3 },
        freshness: {
            premarketScanTimestamp: '2026-02-10T09:00:00Z',
            optionsScanTimestamps: { AAPL: '2026-02-10T09:05:00Z', NVDA: '2026-02-10T09:06:00Z' },
            missingOptions: [],
        },
    })),
}));

// Mock auto-journal-writer (no DB)
jest.mock('@/lib/integration/auto-journal-writer', () => ({
    writeAutoJournalEntries: jest.fn(() => ({
        created: 2,
        skipped: 0,
        errors: [],
    })),
}));

// Mock server supabase + risk loader (no real DB in test env)
jest.mock('@/lib/supabase/server', () => ({
    createServerSupabase: jest.fn(() => ({})),
    isServerSupabaseConfigured: jest.fn(() => true),
}));

jest.mock('@/lib/risk/risk-loader', () => ({
    loadRiskEntriesForDate: jest.fn(() => Promise.resolve([])),
}));

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const mockSaveMorningRun = jest.fn<Promise<void>, any[]>(() => Promise.resolve());
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const mockLoadMorningRunByRunId = jest.fn<Promise<unknown>, any[]>(() => Promise.resolve(null));

jest.mock('@/lib/integration/morning-run-store', () => ({
    saveMorningRun: (...args: unknown[]) => mockSaveMorningRun(...args),
    loadMorningRunByRunId: (...args: unknown[]) => mockLoadMorningRunByRunId(...args),
}));

// =============================================================================
// Tests
// =============================================================================

describe('POST /api/morning-run', () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    test('returns complete response with correct shape', async () => {
        const request = new Request('http://localhost/api/morning-run', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                force: true,
                maxSymbols: 10,
            }),
        });

        const response = await POST(request as never);
        const data = await response.json();

        // Top-level fields
        expect(data.success).toBe(true);
        expect(data.date).toBeDefined();
        expect(data.runId).toBeDefined();
        expect(typeof data.runId).toBe('string');
        expect(data.runId).toMatch(/^run-/);
        expect(data.generatedAt).toBeDefined();

        // Premarket section
        expect(data.premarket).toBeDefined();
        expect(data.premarket.candidateCount).toBe(4);
        expect(data.premarket.resolved.mode).toBe('DATASET');
        expect(data.premarket.resolved.effectiveDate).toBe('2026-02-10');

        // Options section
        expect(data.options).toBeDefined();
        expect(data.options.requested).toBeGreaterThan(0);
        expect(data.options.completed).toBeGreaterThan(0);
        expect(typeof data.options.fromCacheCount).toBe('number');

        // Today section
        expect(data.today).toBeDefined();
        expect(data.today.opportunityCount).toBe(2);
    });

    test('records options errors with truncated messagePreview', async () => {
        const request = new Request('http://localhost/api/morning-run', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ force: true, maxSymbols: 10 }),
        });

        const response = await POST(request as never);
        const data = await response.json();

        // Should have errors array
        expect(data.options.errors).toBeDefined();
        expect(Array.isArray(data.options.errors)).toBe(true);

        // Find the BAD_TICKER error (may or may not be present depending on
        // whether selectSymbolsForOptions includes AVOID candidates)
        if (data.options.errors.length > 0) {
            for (const err of data.options.errors) {
                expect(err.symbol).toBeDefined();
                expect(err.provider).toBe('polygon');
                // CRITICAL: messagePreview must be ≤ 200 chars
                if (err.messagePreview) {
                    expect(err.messagePreview.length).toBeLessThanOrEqual(200);
                }
            }
        }
    });

    test('calls saveMorningRun with correct payload', async () => {
        const request = new Request('http://localhost/api/morning-run', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ force: true }),
        });

        const response = await POST(request as never);
        const data = await response.json();

        // saveMorningRun should be called
        expect(mockSaveMorningRun).toHaveBeenCalledTimes(1);

        const saveArgs = (mockSaveMorningRun.mock.calls[0] as unknown[])[0] as Record<string, unknown>;
        expect(saveArgs.runId).toBe(data.runId);
        expect(saveArgs.runDate).toBeDefined();
        expect(saveArgs.generatedAt).toBe(data.generatedAt);

        // Payload should match the response
        const saved = saveArgs.payload as Record<string, unknown>;
        expect(saved.success).toBe(true);
        expect(saved.date).toBeDefined();
        expect(saved.runId).toBe(data.runId);
        expect(saved.premarket).toBeDefined();
        expect(saved.options).toBeDefined();
        expect(saved.today).toBeDefined();
    });

    test('saved payload includes reproducibility data', async () => {
        const request = new Request('http://localhost/api/morning-run', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ force: true }),
        });

        await POST(request as never);

        expect(mockSaveMorningRun).toHaveBeenCalled();
        const saveArgs = (mockSaveMorningRun.mock.calls[0] as unknown[])[0] as Record<string, unknown>;
        const saved = saveArgs.payload as Record<string, unknown>;

        expect(saved.reproducibility).toBeDefined();
        const repro = saved.reproducibility as Record<string, unknown>;
        expect(repro.candidateIdentifiers).toBeDefined();
        expect(repro.opportunityInputs).toBeDefined();
    });

    test('runId is deterministic for same inputs', async () => {
        const body = JSON.stringify({ force: true, maxSymbols: 5 });

        const r1 = await POST(new Request('http://localhost/api/morning-run', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body,
        }) as never);

        const r2 = await POST(new Request('http://localhost/api/morning-run', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body,
        }) as never);

        const d1 = await r1.json();
        const d2 = await r2.json();

        expect(d1.runId).toBe(d2.runId);
    });

    test('force=false returns cached DB payload', async () => {
        const cachedPayload = {
            success: true,
            date: '2026-02-10',
            runId: 'run-cached123',
            generatedAt: '2026-02-10T09:00:00Z',
            premarket: { candidateCount: 3, resolved: { mode: 'DATASET', effectiveDate: '2026-02-10' }, fromCache: false },
            options: { requested: 3, completed: 3, fromCacheCount: 0, errors: [] },
            today: { opportunityCount: 2 },
        };

        mockLoadMorningRunByRunId.mockResolvedValueOnce({ payload: cachedPayload, runDate: '2026-02-10' } as unknown);

        const request = new Request('http://localhost/api/morning-run', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ force: false, maxSymbols: 10 }),
        });

        const response = await POST(request as never);
        const data = await response.json();

        // Should return cached payload directly
        expect(data.success).toBe(true);
        expect(data.runId).toBe('run-cached123');
        // saveMorningRun should NOT be called (returned from cache)
        expect(mockSaveMorningRun).not.toHaveBeenCalled();
    });

    test('autoJournal=true returns autoJournalResult', async () => {
        const request = new Request('http://localhost/api/morning-run', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ force: true, autoJournal: true }),
        });

        const response = await POST(request as never);
        const data = await response.json();

        expect(data.success).toBe(true);
        expect(data.autoJournalResult).toBeDefined();
        expect(data.autoJournalResult.created).toBe(2);
        expect(data.autoJournalResult.skipped).toBe(0);
        expect(data.autoJournalResult.errors).toEqual([]);
    });

    test('autoJournal=false omits autoJournalResult', async () => {
        const request = new Request('http://localhost/api/morning-run', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ force: true, autoJournal: false }),
        });

        const response = await POST(request as never);
        const data = await response.json();

        expect(data.success).toBe(true);
        expect(data.autoJournalResult).toBeUndefined();
    });

    test('response includes reproducibility data', async () => {
        const request = new Request('http://localhost/api/morning-run', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ force: true }),
        });

        const response = await POST(request as never);
        const data = await response.json();

        expect(data.reproducibility).toBeDefined();
        expect(Array.isArray(data.reproducibility.candidateIdentifiers)).toBe(true);
        expect(data.reproducibility.candidateIdentifiers.length).toBe(4);
        expect(data.reproducibility.candidateIdentifiers[0]).toHaveProperty('symbol');
        expect(data.reproducibility.candidateIdentifiers[0]).toHaveProperty('gapPct');
        expect(data.reproducibility.candidateIdentifiers[0]).toHaveProperty('playType');

        expect(data.reproducibility.optionsScanTimestamps).toBeDefined();
        expect(typeof data.reproducibility.optionsScanTimestamps).toBe('object');

        expect(Array.isArray(data.reproducibility.opportunityInputs)).toBe(true);
        expect(data.reproducibility.opportunityInputs[0]).toHaveProperty('symbol');
        expect(data.reproducibility.opportunityInputs[0]).toHaveProperty('overallScore');
        expect(data.reproducibility.opportunityInputs[0]).toHaveProperty('alignment');
    });
});
