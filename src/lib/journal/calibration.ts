/**
 * Expert Calibration Service
 * 
 * Tracks expert performance and adjusts weights based on outcomes.
 * Implements incremental Bayesian-style calibration.
 */

import { supabase, isSupabaseConfigured } from '../supabase/client';
import type { DeskType } from '../experts/types';
import type { CalibrationUpdate } from './types';

// Calibration config
const CONFIG = {
    minSignalsForCalibration: 10,
    maxWeightChange: 0.05,    // Max 5% change per calibration
    learningRate: 0.1,        // How fast to adjust
    decayRate: 0.95,          // Weight decay for older signals
};

// Expert calibration data from DB
interface DbCalibrationRow {
    expert_name: string;
    weight: number;
    total_signals: number;
    correct_signals: number;
}

/**
 * Get current calibration for all experts on a desk
 */
export async function getCalibration(deskType: DeskType): Promise<Map<string, number>> {
    const weights = new Map<string, number>();

    if (!isSupabaseConfigured()) {
        return weights;
    }

    const { data, error } = await supabase
        .from('expert_calibration')
        .select('*')
        .eq('desk_type', deskType);

    if (error || !data) {
        console.error('Failed to fetch calibration:', error);
        return weights;
    }

    for (const row of data) {
        const calibRow = row as unknown as DbCalibrationRow;
        weights.set(calibRow.expert_name, calibRow.weight);
    }

    return weights;
}

/**
 * Record a signal outcome for calibration
 */
export async function recordSignalOutcome(
    expertName: string,
    deskType: DeskType,
    wasCorrect: boolean
): Promise<void> {
    if (!isSupabaseConfigured()) return;

    // Get current calibration
    const { data: existing } = await supabase
        .from('expert_calibration')
        .select('*')
        .eq('expert_name', expertName)
        .eq('desk_type', deskType)
        .single();

    if (existing) {
        // Update existing - use any to bypass strict type checking
        const calibData = existing as unknown as DbCalibrationRow;
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        await (supabase.from('expert_calibration') as any)
            .update({
                total_signals: calibData.total_signals + 1,
                correct_signals: calibData.correct_signals + (wasCorrect ? 1 : 0),
                last_calibrated: new Date().toISOString(),
            })
            .eq('expert_name', expertName)
            .eq('desk_type', deskType);
    } else {
        // Insert new
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        await (supabase.from('expert_calibration') as any)
            .insert({
                expert_name: expertName,
                desk_type: deskType,
                weight: 0.1, // Default weight
                total_signals: 1,
                correct_signals: wasCorrect ? 1 : 0,
                last_calibrated: new Date().toISOString(),
            });
    }
}

/**
 * Run calibration update for a desk
 * Returns list of weight changes made
 */
export async function runCalibration(deskType: DeskType): Promise<CalibrationUpdate[]> {
    if (!isSupabaseConfigured()) return [];

    const { data, error } = await supabase
        .from('expert_calibration')
        .select('*')
        .eq('desk_type', deskType);

    if (error || !data) {
        console.error('Failed to run calibration:', error);
        return [];
    }

    const updates: CalibrationUpdate[] = [];

    for (const row of data) {
        const calib = row as unknown as DbCalibrationRow;

        // Need minimum signals
        if (calib.total_signals < CONFIG.minSignalsForCalibration) {
            continue;
        }

        // Calculate accuracy
        const accuracy = calib.correct_signals / calib.total_signals;

        // Calculate new weight
        // Higher accuracy = higher weight, but capped change
        const targetWeight = accuracy; // Simple: accuracy maps to weight
        const currentWeight = calib.weight;
        const difference = targetWeight - currentWeight;

        // Apply learning rate and cap
        let delta = difference * CONFIG.learningRate;
        delta = Math.max(-CONFIG.maxWeightChange, Math.min(CONFIG.maxWeightChange, delta));

        const newWeight = Math.max(0.01, Math.min(0.5, currentWeight + delta));

        if (Math.abs(newWeight - currentWeight) > 0.001) {
            // Update in database
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            await (supabase.from('expert_calibration') as any)
                .update({
                    weight: newWeight,
                    accuracy_30d: accuracy,
                    last_calibrated: new Date().toISOString(),
                })
                .eq('expert_name', calib.expert_name)
                .eq('desk_type', deskType);

            updates.push({
                expertName: calib.expert_name,
                deskType,
                previousWeight: currentWeight,
                newWeight,
                correctSignals: calib.correct_signals,
                totalSignals: calib.total_signals,
                accuracy,
                calibratedAt: new Date(),
            });
        }
    }

    return updates;
}

/**
 * Get calibration history for audit
 */
export async function getCalibrationHistory(
    _expertName?: string,
    _limit = 50
): Promise<CalibrationUpdate[]> {
    // This would query a calibration_history table
    // For now, return empty (table not created yet)
    return [];
}
