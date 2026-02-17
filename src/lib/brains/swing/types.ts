/**
 * Swing Desk Brain — Types
 *
 * Placeholder types for the swing trading desk.
 * NOT_IMPLEMENTED — no functionality yet.
 */

export interface SwingScanResult {
    symbol: string;
    status: 'NOT_IMPLEMENTED';
}

export interface SwingConfig {
    holdingPeriodDays: number;
    minRelativeStrength: number;
}

export const DEFAULT_SWING_CONFIG: SwingConfig = {
    holdingPeriodDays: 5,
    minRelativeStrength: 70,
};
