/**
 * Signal Store
 * 
 * Server-side only JSON file store for signal journal.
 * WARNING: This is for dev/self-host only - NOT for serverless deployment.
 * 
 * All read/write operations happen in Node.js API routes.
 */

import fs from 'fs';
import path from 'path';
import type {
    SignalRecord,
    SignalOutcome,
    SignalStore,
    SignalJournalStats,
    StrategyPerformance,
    RegimePerformance,
    BucketPerformance,
} from './signal-types';

// Store file location
const DATA_DIR = path.join(process.cwd(), 'data');
const STORE_FILE = path.join(DATA_DIR, 'signal-journal.json');

/**
 * Initialize empty store
 */
function createEmptyStore(): SignalStore {
    return {
        signals: [],
        outcomes: [],
        lastUpdated: new Date().toISOString(),
        version: 'V1',
    };
}

/**
 * Ensure data directory exists
 */
function ensureDataDir(): void {
    if (!fs.existsSync(DATA_DIR)) {
        fs.mkdirSync(DATA_DIR, { recursive: true });
    }
}

/**
 * Read store from disk (server-side only)
 */
export function readStore(): SignalStore {
    ensureDataDir();

    if (!fs.existsSync(STORE_FILE)) {
        const empty = createEmptyStore();
        writeStore(empty);
        return empty;
    }

    try {
        const data = fs.readFileSync(STORE_FILE, 'utf-8');
        const store = JSON.parse(data) as SignalStore;
        return store;
    } catch (error) {
        console.error('[SignalStore] Error reading store:', error);
        return createEmptyStore();
    }
}

/**
 * Write store to disk (server-side only)
 */
export function writeStore(store: SignalStore): void {
    ensureDataDir();

    store.lastUpdated = new Date().toISOString();

    try {
        fs.writeFileSync(STORE_FILE, JSON.stringify(store, null, 2), 'utf-8');
    } catch (error) {
        console.error('[SignalStore] Error writing store:', error);
        throw error;
    }
}

/**
 * Add signals to store (idempotent by ID)
 */
export function addSignals(newSignals: SignalRecord[]): { added: number; skipped: number } {
    const store = readStore();
    const existingIds = new Set(store.signals.map(s => s.id));

    let added = 0;
    let skipped = 0;

    for (const signal of newSignals) {
        if (existingIds.has(signal.id)) {
            skipped++;
        } else {
            store.signals.push(signal);
            existingIds.add(signal.id);
            added++;
        }
    }

    if (added > 0) {
        writeStore(store);
    }

    return { added, skipped };
}

/**
 * Update signal status
 */
export function updateSignalStatus(signalId: string, status: SignalRecord['status']): boolean {
    const store = readStore();
    const signal = store.signals.find(s => s.id === signalId);

    if (!signal) {
        return false;
    }

    signal.status = status;
    writeStore(store);
    return true;
}

/**
 * Add outcome for a signal
 */
export function addOutcome(outcome: SignalOutcome): boolean {
    const store = readStore();

    // Check if signal exists
    const signal = store.signals.find(s => s.id === outcome.signalId);
    if (!signal) {
        console.warn(`[SignalStore] Signal not found: ${outcome.signalId}`);
        return false;
    }

    // Check if outcome already exists
    const existingIndex = store.outcomes.findIndex(o => o.signalId === outcome.signalId);
    if (existingIndex >= 0) {
        // Replace existing
        store.outcomes[existingIndex] = outcome;
    } else {
        store.outcomes.push(outcome);
    }

    // Update signal status
    signal.status = 'evaluated';

    writeStore(store);
    return true;
}

/**
 * Get signals with optional filters
 */
export function getSignals(filters?: {
    symbol?: string;
    strategy?: string;
    status?: 'pending' | 'evaluated' | 'all';
    startDate?: string;
    endDate?: string;
    limit?: number;
}): SignalRecord[] {
    const store = readStore();
    let results = [...store.signals];

    if (filters?.symbol) {
        results = results.filter(s => s.symbol === filters.symbol);
    }

    if (filters?.strategy) {
        results = results.filter(s => s.strategyName === filters.strategy);
    }

    if (filters?.status && filters.status !== 'all') {
        results = results.filter(s => s.status === filters.status);
    }

    if (filters?.startDate) {
        const start = new Date(filters.startDate).getTime();
        results = results.filter(s => s.signalBarTimestamp >= start);
    }

    if (filters?.endDate) {
        const end = new Date(filters.endDate).getTime();
        results = results.filter(s => s.signalBarTimestamp <= end);
    }

    // Sort by timestamp descending (newest first)
    results.sort((a, b) => b.signalBarTimestamp - a.signalBarTimestamp);

    if (filters?.limit && filters.limit > 0) {
        results = results.slice(0, filters.limit);
    }

    return results;
}

/**
 * Get outcome for a signal
 */
export function getOutcome(signalId: string): SignalOutcome | null {
    const store = readStore();
    return store.outcomes.find(o => o.signalId === signalId) || null;
}

/**
 * Get all outcomes
 */
export function getOutcomes(): SignalOutcome[] {
    const store = readStore();
    return store.outcomes;
}

/**
 * Get pending signals (not yet evaluated)
 */
export function getPendingSignals(): SignalRecord[] {
    return getSignals({ status: 'pending' });
}

/**
 * Compute aggregated stats
 * @param includeSeed - if true, include V1-SEED signals in stats (default: false)
 */
export function computeStats(includeSeed: boolean = false): SignalJournalStats {
    const store = readStore();
    const { signals, outcomes } = store;

    // Filter out seed signals by default
    const realSignals = includeSeed
        ? signals
        : signals.filter(s => s.version === 'V1');

    const evaluated = realSignals.filter(s => s.status === 'evaluated');
    const pending = realSignals.filter(s => s.status === 'pending');

    // Create outcome lookup
    const outcomeMap = new Map(outcomes.map(o => [o.signalId, o]));

    // Overall metrics
    let totalMFE = 0;
    let totalMAE = 0;
    let hitTargetCount = 0;
    let hitStopCount = 0;
    let timeoutCount = 0;

    // By strategy
    const strategyMap = new Map<string, {
        count: number;
        totalScore: number;
        hitTarget: number;
        totalMFE: number;
        totalMAE: number;
    }>();

    // By regime
    const regimeStats = {
        trending: { count: 0, hitTarget: 0, totalMFE: 0, totalMAE: 0 },
        choppy: { count: 0, hitTarget: 0, totalMFE: 0, totalMAE: 0 },
        highVol: { count: 0, hitTarget: 0, totalMFE: 0, totalMAE: 0 },
        lowVol: { count: 0, hitTarget: 0, totalMFE: 0, totalMAE: 0 },
    };

    // By score bucket
    const bucketMap = new Map<string, {
        count: number;
        hitTarget: number;
        totalMFE: number;
        totalMAE: number;
    }>();

    for (const signal of evaluated) {
        const outcome = outcomeMap.get(signal.id);
        if (!outcome) continue;

        // Overall
        totalMFE += outcome.mfe;
        totalMAE += outcome.mae;
        if (outcome.exitReason === 'target') hitTargetCount++;
        else if (outcome.exitReason === 'stop') hitStopCount++;
        else timeoutCount++;

        // By strategy
        const strat = strategyMap.get(signal.strategyName) || {
            count: 0, totalScore: 0, hitTarget: 0, totalMFE: 0, totalMAE: 0
        };
        strat.count++;
        strat.totalScore += signal.score;
        if (outcome.exitReason === 'target') strat.hitTarget++;
        strat.totalMFE += outcome.mfe;
        strat.totalMAE += outcome.mae;
        strategyMap.set(signal.strategyName, strat);

        // By regime
        if (signal.regimeTrending) {
            regimeStats.trending.count++;
            if (outcome.exitReason === 'target') regimeStats.trending.hitTarget++;
            regimeStats.trending.totalMFE += outcome.mfe;
            regimeStats.trending.totalMAE += outcome.mae;
        } else {
            regimeStats.choppy.count++;
            if (outcome.exitReason === 'target') regimeStats.choppy.hitTarget++;
            regimeStats.choppy.totalMFE += outcome.mfe;
            regimeStats.choppy.totalMAE += outcome.mae;
        }

        if (signal.regimeHighVol) {
            regimeStats.highVol.count++;
            if (outcome.exitReason === 'target') regimeStats.highVol.hitTarget++;
            regimeStats.highVol.totalMFE += outcome.mfe;
            regimeStats.highVol.totalMAE += outcome.mae;
        } else {
            regimeStats.lowVol.count++;
            if (outcome.exitReason === 'target') regimeStats.lowVol.hitTarget++;
            regimeStats.lowVol.totalMFE += outcome.mfe;
            regimeStats.lowVol.totalMAE += outcome.mae;
        }

        // By score bucket
        const bucket = getScoreBucket(signal.score);
        const bucketStats = bucketMap.get(bucket) || {
            count: 0, hitTarget: 0, totalMFE: 0, totalMAE: 0
        };
        bucketStats.count++;
        if (outcome.exitReason === 'target') bucketStats.hitTarget++;
        bucketStats.totalMFE += outcome.mfe;
        bucketStats.totalMAE += outcome.mae;
        bucketMap.set(bucket, bucketStats);
    }

    const evalCount = evaluated.length || 1; // Avoid division by zero

    // Build strategy performance
    const byStrategy: Record<string, StrategyPerformance> = {};
    for (const [name, stats] of Array.from(strategyMap.entries())) {
        byStrategy[name] = {
            count: stats.count,
            avgScore: stats.count > 0 ? stats.totalScore / stats.count : 0,
            hitTargetRate: stats.count > 0 ? stats.hitTarget / stats.count : 0,
            avgMFE: stats.count > 0 ? stats.totalMFE / stats.count : 0,
            avgMAE: stats.count > 0 ? stats.totalMAE / stats.count : 0,
        };
    }

    // Build regime performance
    function buildRegimePerf(stats: typeof regimeStats.trending): RegimePerformance {
        return {
            count: stats.count,
            hitTargetRate: stats.count > 0 ? stats.hitTarget / stats.count : 0,
            avgMFE: stats.count > 0 ? stats.totalMFE / stats.count : 0,
            avgMAE: stats.count > 0 ? stats.totalMAE / stats.count : 0,
        };
    }

    // Build bucket performance
    const byScoreBucket: Record<string, BucketPerformance> = {};
    for (const [bucket, stats] of Array.from(bucketMap.entries())) {
        byScoreBucket[bucket] = {
            count: stats.count,
            hitTargetRate: stats.count > 0 ? stats.hitTarget / stats.count : 0,
            avgMFE: stats.count > 0 ? stats.totalMFE / stats.count : 0,
            avgMAE: stats.count > 0 ? stats.totalMAE / stats.count : 0,
        };
    }

    return {
        totalSignals: signals.length,
        evaluated: evaluated.length,
        pending: pending.length,
        avgMFE: totalMFE / evalCount,
        avgMAE: totalMAE / evalCount,
        hitTargetRate: hitTargetCount / evalCount,
        hitStopRate: hitStopCount / evalCount,
        timeoutRate: timeoutCount / evalCount,
        byStrategy,
        byRegime: {
            trending: buildRegimePerf(regimeStats.trending),
            choppy: buildRegimePerf(regimeStats.choppy),
            highVol: buildRegimePerf(regimeStats.highVol),
            lowVol: buildRegimePerf(regimeStats.lowVol),
        },
        byScoreBucket,
    };
}

/**
 * Get score bucket label
 */
function getScoreBucket(score: number): string {
    if (score >= 90) return '90-100';
    if (score >= 80) return '80-89';
    if (score >= 70) return '70-79';
    if (score >= 60) return '60-69';
    if (score >= 50) return '50-59';
    return '0-49';
}
