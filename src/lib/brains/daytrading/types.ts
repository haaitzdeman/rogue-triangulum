/**
 * Daytrading Desk Brain — Types
 *
 * Placeholder types for the daytrading desk.
 * NOT_IMPLEMENTED — no functionality yet.
 */

export interface DaytradeScanResult {
    symbol: string;
    status: 'NOT_IMPLEMENTED';
}

export interface DaytradeConfig {
    maxRiskPerTradePct: number;
    sessionWindow: 'FULL_DAY' | 'MORNING_ONLY' | 'POWER_HOUR';
}

export const DEFAULT_DAYTRADE_CONFIG: DaytradeConfig = {
    maxRiskPerTradePct: 1.0,
    sessionWindow: 'MORNING_ONLY',
};
