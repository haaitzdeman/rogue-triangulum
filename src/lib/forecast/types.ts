/**
 * Forecast Types
 * 
 * Types for tracking predictions and evaluating accuracy.
 */

import type { DeskType, ExpertContribution } from '../core/types';

// Forecast status
export type ForecastStatus = 'pending' | 'evaluated' | 'expired' | 'cancelled';

/**
 * Frozen forecast - prediction snapshot at creation time
 */
export interface ForecastItem {
    id: string;
    createdAt: Date;

    // Source
    brainType: DeskType;
    symbol: string;

    // Frozen prediction (never changes after creation)
    predictedReturnMean: number;
    predictedIntervalLow: number;
    predictedIntervalHigh: number;
    predictedProbProfit: number;
    confidence: number;
    direction: 'long' | 'short' | 'neutral';

    // Evaluation window
    evaluationWindowHours: number;
    evaluationWindowEnd: Date;

    // Frozen feature snapshot
    featureSnapshot: Record<string, number>;
    expertContributions: ExpertContribution[];
    mixerWeights: number[];

    // Status
    status: ForecastStatus;

    // Optional: linked to trade
    linkedOrderId?: string;
}

/**
 * Forecast outcome - realized result after evaluation
 */
export interface ForecastOutcome {
    id: string;
    forecastId: string;
    evaluatedAt: Date;

    // Realized data
    actualReturn: number;
    priceAtPrediction: number;
    priceAtEvaluation: number;

    // Error metrics
    error: number;                    // predicted - actual
    absoluteError: number;            // |error|
    squaredError: number;             // error^2

    // Calibration checks
    withinInterval: boolean;          // Was actual within predicted interval?
    directionCorrect: boolean;        // Did we get direction right?
    profitIfTraded: boolean;          // Would trade have been profitable?
}

/**
 * Calibration state - per-desk calibration metrics
 */
export interface CalibrationState {
    deskType: DeskType;
    lastUpdated: Date;

    // Sample counts
    totalForecasts: number;
    evaluatedForecasts: number;

    // Accuracy metrics
    meanError: number;                // Average error (bias)
    meanAbsoluteError: number;        // MAE
    rootMeanSquaredError: number;     // RMSE

    // Calibration
    intervalCoverage: number;         // % of actuals within interval
    directionalAccuracy: number;      // % correct direction

    // By confidence bucket
    byConfidenceBucket: Array<{
        min: number;
        max: number;
        count: number;
        accuracy: number;
    }>;

    // Expert reliability
    expertReliability: Record<string, {
        accuracy: number;
        contribution: number;
    }>;
}

/**
 * Learning log entry - tracks calibration changes
 */
export interface LearningLogEntry {
    id: string;
    createdAt: Date;

    // Change type
    changeType: 'calibration_update' | 'weight_adjustment' | 'bias_correction';

    // Before/after
    beforeState: Partial<CalibrationState>;
    afterState: Partial<CalibrationState>;

    // Reason
    reason: string;
    triggeredBy: string;  // What caused the update

    // Rollback token
    rollbackToken: string;
    canRollback: boolean;
}

/**
 * Accuracy stats summary
 */
export interface AccuracyStats {
    period: 'day' | 'week' | 'month' | 'all';
    startDate: Date;
    endDate: Date;

    // Counts
    totalForecasts: number;
    evaluated: number;
    pending: number;

    // Accuracy
    directionalAccuracy: number;
    meanAbsoluteError: number;
    intervalCoverage: number;

    // By brain
    byBrain: Record<DeskType, {
        forecasts: number;
        accuracy: number;
        mae: number;
    }>;

    // Best/worst
    bestExpert: string;
    worstExpert: string;
}
