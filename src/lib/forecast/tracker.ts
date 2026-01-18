/**
 * Forecast Tracker Service
 * 
 * Freezes predictions at creation and evaluates against realized outcomes.
 * Core of the learning loop.
 */

import { v4 as uuidv4 } from 'uuid';
import type { BrainPrediction, DeskType } from '../core/types';
import type {
    ForecastItem,
    ForecastOutcome,
    ForecastStatus,
    AccuracyStats,
    CalibrationState
} from './types';

/**
 * In-memory forecast store (would be Supabase in production)
 */
class ForecastStore {
    private forecasts: Map<string, ForecastItem> = new Map();
    private outcomes: Map<string, ForecastOutcome> = new Map();
    private calibration: Map<DeskType, CalibrationState> = new Map();

    // Forecasts
    addForecast(forecast: ForecastItem): void {
        this.forecasts.set(forecast.id, forecast);
    }

    getForecast(id: string): ForecastItem | undefined {
        return this.forecasts.get(id);
    }

    getPendingForecasts(): ForecastItem[] {
        return Array.from(this.forecasts.values())
            .filter(f => f.status === 'pending');
    }

    getForecasts(filter?: {
        status?: ForecastStatus;
        brain?: DeskType;
        limit?: number
    }): ForecastItem[] {
        let results = Array.from(this.forecasts.values());

        if (filter?.status) {
            results = results.filter(f => f.status === filter.status);
        }
        if (filter?.brain) {
            results = results.filter(f => f.brainType === filter.brain);
        }

        results.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());

        if (filter?.limit) {
            results = results.slice(0, filter.limit);
        }

        return results;
    }

    updateForecastStatus(id: string, status: ForecastStatus): void {
        const forecast = this.forecasts.get(id);
        if (forecast) {
            forecast.status = status;
        }
    }

    // Outcomes
    addOutcome(outcome: ForecastOutcome): void {
        this.outcomes.set(outcome.id, outcome);
    }

    getOutcome(forecastId: string): ForecastOutcome | undefined {
        return Array.from(this.outcomes.values())
            .find(o => o.forecastId === forecastId);
    }

    getOutcomes(limit?: number): ForecastOutcome[] {
        const results = Array.from(this.outcomes.values())
            .sort((a, b) => b.evaluatedAt.getTime() - a.evaluatedAt.getTime());
        return limit ? results.slice(0, limit) : results;
    }

    // Calibration
    getCalibration(desk: DeskType): CalibrationState | undefined {
        return this.calibration.get(desk);
    }

    setCalibration(desk: DeskType, state: CalibrationState): void {
        this.calibration.set(desk, state);
    }

    // Stats
    getStats(): { forecasts: number; outcomes: number } {
        return {
            forecasts: this.forecasts.size,
            outcomes: this.outcomes.size,
        };
    }
}

// Singleton store
const store = new ForecastStore();

/**
 * Forecast Tracker
 */
export class ForecastTracker {

    /**
     * Create a frozen forecast from a brain prediction
     */
    createForecast(prediction: BrainPrediction): ForecastItem {
        const forecast: ForecastItem = {
            id: prediction.id || uuidv4(),
            createdAt: new Date(),

            brainType: prediction.brainType,
            symbol: prediction.symbol,

            // Freeze the prediction
            predictedReturnMean: prediction.predictedReturnMean,
            predictedIntervalLow: prediction.predictedIntervalLow,
            predictedIntervalHigh: prediction.predictedIntervalHigh,
            predictedProbProfit: prediction.predictedProbProfit,
            confidence: prediction.confidence,
            direction: prediction.direction,

            evaluationWindowHours: prediction.evaluationWindowHours,
            evaluationWindowEnd: prediction.evaluationWindowEnd,

            // Freeze feature snapshot
            featureSnapshot: { ...prediction.featureSnapshot },
            expertContributions: [...prediction.expertContributions],
            mixerWeights: [...prediction.mixerWeights],

            status: 'pending',
        };

        store.addForecast(forecast);
        console.log(`[ForecastTracker] Created forecast: ${forecast.id} for ${forecast.symbol}`);

        return forecast;
    }

    /**
     * Get a forecast by ID
     */
    getForecast(id: string): ForecastItem | undefined {
        return store.getForecast(id);
    }

    /**
     * Get forecasts with optional filters
     */
    getForecasts(filter?: {
        status?: ForecastStatus;
        brain?: DeskType;
        limit?: number
    }): ForecastItem[] {
        return store.getForecasts(filter);
    }

    /**
     * Evaluate a single forecast against realized outcome
     */
    evaluateForecast(
        forecastId: string,
        actualReturn: number,
        priceAtPrediction: number,
        priceAtEvaluation: number
    ): ForecastOutcome | null {
        const forecast = store.getForecast(forecastId);

        if (!forecast) {
            console.warn(`[ForecastTracker] Forecast not found: ${forecastId}`);
            return null;
        }

        if (forecast.status !== 'pending') {
            console.warn(`[ForecastTracker] Forecast already evaluated: ${forecastId}`);
            return null;
        }

        // Calculate errors
        const error = forecast.predictedReturnMean - actualReturn;
        const absoluteError = Math.abs(error);
        const squaredError = error * error;

        // Calibration checks
        const withinInterval = actualReturn >= forecast.predictedIntervalLow &&
            actualReturn <= forecast.predictedIntervalHigh;

        const directionCorrect =
            (forecast.direction === 'long' && actualReturn > 0) ||
            (forecast.direction === 'short' && actualReturn < 0) ||
            (forecast.direction === 'neutral' && Math.abs(actualReturn) < 0.005);

        const profitIfTraded =
            (forecast.direction === 'long' && actualReturn > 0) ||
            (forecast.direction === 'short' && actualReturn < 0);

        const outcome: ForecastOutcome = {
            id: uuidv4(),
            forecastId,
            evaluatedAt: new Date(),

            actualReturn,
            priceAtPrediction,
            priceAtEvaluation,

            error,
            absoluteError,
            squaredError,

            withinInterval,
            directionCorrect,
            profitIfTraded,
        };

        store.addOutcome(outcome);
        store.updateForecastStatus(forecastId, 'evaluated');

        console.log(`[ForecastTracker] Evaluated ${forecastId}: ` +
            `error=${error.toFixed(4)}, direction=${directionCorrect ? '✓' : '✗'}`);

        return outcome;
    }

    /**
     * Check for forecasts ready to evaluate
     */
    getPendingForecasts(): ForecastItem[] {
        return store.getPendingForecasts();
    }

    /**
     * Get forecasts that have passed their evaluation window
     */
    getExpiredForecasts(): ForecastItem[] {
        const now = Date.now();
        return store.getPendingForecasts()
            .filter(f => f.evaluationWindowEnd.getTime() < now);
    }

    /**
     * Calculate accuracy stats
     */
    getAccuracyStats(period: 'day' | 'week' | 'month' | 'all' = 'all'): AccuracyStats {
        const now = new Date();
        let startDate: Date;

        switch (period) {
            case 'day':
                startDate = new Date(now.getTime() - 24 * 60 * 60 * 1000);
                break;
            case 'week':
                startDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
                break;
            case 'month':
                startDate = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
                break;
            default:
                startDate = new Date(0);
        }

        const outcomes = store.getOutcomes()
            .filter(o => o.evaluatedAt >= startDate);

        const forecasts = store.getForecasts()
            .filter(f => f.createdAt >= startDate);

        const pending = forecasts.filter(f => f.status === 'pending').length;

        // Calculate metrics
        const directionalAccuracy = outcomes.length > 0
            ? outcomes.filter(o => o.directionCorrect).length / outcomes.length
            : 0;

        const meanAbsoluteError = outcomes.length > 0
            ? outcomes.reduce((sum, o) => sum + o.absoluteError, 0) / outcomes.length
            : 0;

        const intervalCoverage = outcomes.length > 0
            ? outcomes.filter(o => o.withinInterval).length / outcomes.length
            : 0;

        // By brain
        const desks: DeskType[] = ['day-trading', 'options', 'swing', 'investing'];
        const byBrain: AccuracyStats['byBrain'] = {} as AccuracyStats['byBrain'];

        for (const desk of desks) {
            const deskForecasts = forecasts.filter(f => f.brainType === desk);
            const deskOutcomes = outcomes.filter(o => {
                const f = store.getForecast(o.forecastId);
                return f?.brainType === desk;
            });

            byBrain[desk] = {
                forecasts: deskForecasts.length,
                accuracy: deskOutcomes.length > 0
                    ? deskOutcomes.filter(o => o.directionCorrect).length / deskOutcomes.length
                    : 0,
                mae: deskOutcomes.length > 0
                    ? deskOutcomes.reduce((sum, o) => sum + o.absoluteError, 0) / deskOutcomes.length
                    : 0,
            };
        }

        return {
            period,
            startDate,
            endDate: now,

            totalForecasts: forecasts.length,
            evaluated: outcomes.length,
            pending,

            directionalAccuracy,
            meanAbsoluteError,
            intervalCoverage,

            byBrain,

            bestExpert: 'TBD',
            worstExpert: 'TBD',
        };
    }

    /**
     * Get store stats
     */
    getStoreStats(): { forecasts: number; outcomes: number } {
        return store.getStats();
    }

    /**
     * Link a forecast to an order
     */
    linkToOrder(forecastId: string, orderId: string): void {
        const forecast = store.getForecast(forecastId);
        if (forecast) {
            forecast.linkedOrderId = orderId;
        }
    }
}

// Singleton instance
let trackerInstance: ForecastTracker | null = null;

export function getForecastTracker(): ForecastTracker {
    if (!trackerInstance) {
        trackerInstance = new ForecastTracker();
    }
    return trackerInstance;
}
