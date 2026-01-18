/**
 * Readiness Gates
 * 
 * Checks that must pass before LIVE trading can be enabled.
 * Protects users from going live before system is proven.
 */

import { getForecastTracker } from '../forecast';
import { getTradeGate } from '../execution';

/**
 * Gate configuration
 */
export interface GateConfig {
    minForecasts: number;          // Minimum evaluated forecasts
    minIntervalCoverage: number;   // Min % of actuals within predicted interval
    maxDrawdownBreaches: number;   // Max times daily loss exceeded
    checkPeriodDays: number;       // Look-back period for checks
}

/**
 * Default gate configuration
 */
export const DEFAULT_GATE_CONFIG: GateConfig = {
    minForecasts: 200,
    minIntervalCoverage: 0.7,
    maxDrawdownBreaches: 3,
    checkPeriodDays: 30,
};

/**
 * Individual gate result
 */
export interface GateResult {
    name: string;
    passed: boolean;
    reason: string;
    current?: number | string;
    required?: number | string;
    details?: string;
}

/**
 * Overall readiness result
 */
export interface ReadinessResult {
    ready: boolean;
    gates: GateResult[];
    passedCount: number;
    totalCount: number;
    blockers: string[];
}

/**
 * Risk profile configuration
 */
export interface RiskProfile {
    maxDailyLoss: number;
    maxTradeRisk: number;
    maxPositions: number;
    maxTradesPerDay: number;
    confirmedAt?: Date;
}

// In-memory storage
let riskProfile: RiskProfile | null = null;
const drawdownBreaches: Date[] = [];

/**
 * Readiness Gates Checker
 */
export class ReadinessGates {
    private config: GateConfig;

    constructor(config?: Partial<GateConfig>) {
        this.config = { ...DEFAULT_GATE_CONFIG, ...config };
    }

    /**
     * Check all readiness gates
     */
    checkAll(): ReadinessResult {
        const gates: GateResult[] = [
            this.checkMinForecasts(),
            this.checkCalibration(),
            this.checkDrawdown(),
            this.checkRiskProfile(),
            this.checkNoErrors(),
        ];

        const passedCount = gates.filter(g => g.passed).length;
        const blockers = gates.filter(g => !g.passed).map(g => g.name);

        return {
            ready: passedCount === gates.length,
            gates,
            passedCount,
            totalCount: gates.length,
            blockers,
        };
    }

    /**
     * Gate 1: Minimum forecast sample
     */
    checkMinForecasts(): GateResult {
        const tracker = getForecastTracker();
        const stats = tracker.getAccuracyStats('all');
        const evaluated = stats.evaluated;

        return {
            name: 'Minimum Forecasts',
            passed: evaluated >= this.config.minForecasts,
            reason: evaluated >= this.config.minForecasts
                ? `${evaluated} forecasts evaluated`
                : `Need ${this.config.minForecasts - evaluated} more forecasts`,
            current: evaluated,
            required: this.config.minForecasts,
        };
    }

    /**
     * Gate 2: Calibration sanity
     */
    checkCalibration(): GateResult {
        const tracker = getForecastTracker();
        const stats = tracker.getAccuracyStats('month');
        const coverage = stats.intervalCoverage;

        // Need some data to check
        if (stats.evaluated < 20) {
            return {
                name: 'Calibration',
                passed: false,
                reason: 'Need more data for calibration check',
                current: stats.evaluated,
                required: 20,
            };
        }

        return {
            name: 'Calibration',
            passed: coverage >= this.config.minIntervalCoverage,
            reason: coverage >= this.config.minIntervalCoverage
                ? `Interval coverage ${(coverage * 100).toFixed(1)}%`
                : `Coverage too low: ${(coverage * 100).toFixed(1)}%`,
            current: `${(coverage * 100).toFixed(1)}%`,
            required: `${(this.config.minIntervalCoverage * 100).toFixed(0)}%`,
        };
    }

    /**
     * Gate 3: Drawdown constraints
     */
    checkDrawdown(): GateResult {
        // Filter to recent period
        const cutoff = Date.now() - this.config.checkPeriodDays * 24 * 60 * 60 * 1000;
        const recentBreaches = drawdownBreaches.filter(d => d.getTime() > cutoff);

        return {
            name: 'Drawdown Control',
            passed: recentBreaches.length <= this.config.maxDrawdownBreaches,
            reason: recentBreaches.length <= this.config.maxDrawdownBreaches
                ? `${recentBreaches.length} breach(es) in last ${this.config.checkPeriodDays} days`
                : `Too many drawdown breaches: ${recentBreaches.length}`,
            current: recentBreaches.length,
            required: `≤${this.config.maxDrawdownBreaches}`,
        };
    }

    /**
     * Gate 4: Risk profile configured
     */
    checkRiskProfile(): GateResult {
        const complete = riskProfile !== null && riskProfile.confirmedAt !== undefined;

        return {
            name: 'Risk Profile',
            passed: complete,
            reason: complete
                ? 'Risk limits configured and confirmed'
                : 'Configure and confirm your risk limits',
            details: complete && riskProfile
                ? `Max loss: $${riskProfile.maxDailyLoss}, Max risk: $${riskProfile.maxTradeRisk}`
                : undefined,
        };
    }

    /**
     * Gate 5: No critical errors
     */
    checkNoErrors(): GateResult {
        const tradeGate = getTradeGate();
        const killSwitchActive = tradeGate.guardrails.killSwitchActive;

        return {
            name: 'System Health',
            passed: !killSwitchActive,
            reason: killSwitchActive
                ? 'Kill switch is active - resolve before going live'
                : 'No critical errors detected',
        };
    }

    /**
     * Set risk profile
     */
    setRiskProfile(profile: Omit<RiskProfile, 'confirmedAt'>): void {
        riskProfile = {
            ...profile,
            confirmedAt: new Date(),
        };

        // Apply to TradeGate
        const tradeGate = getTradeGate();
        tradeGate.updateGuardrails({
            maxDailyRealizedLoss: profile.maxDailyLoss,
            maxRiskPerTrade: profile.maxTradeRisk,
            maxOpenPositions: profile.maxPositions,
            maxTradesPerDay: profile.maxTradesPerDay,
        });

        console.log('[ReadinessGates] Risk profile configured');
    }

    /**
     * Get risk profile
     */
    getRiskProfile(): RiskProfile | null {
        return riskProfile;
    }

    /**
     * Record a drawdown breach
     */
    recordDrawdownBreach(): void {
        drawdownBreaches.push(new Date());
        console.log('[ReadinessGates] Drawdown breach recorded');
    }

    /**
     * Get gate config
     */
    getConfig(): GateConfig {
        return { ...this.config };
    }
}

// Singleton
let gatesInstance: ReadinessGates | null = null;

export function getReadinessGates(config?: Partial<GateConfig>): ReadinessGates {
    if (!gatesInstance) {
        gatesInstance = new ReadinessGates(config);
    }
    return gatesInstance;
}
