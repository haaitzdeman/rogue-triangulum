/**
 * Risk Config
 *
 * Loads risk parameters from env vars with sane defaults.
 * No side effects — just reads process.env at call time.
 */

import type { RiskConfig } from './risk-engine';
import type { DuplicateScope } from './risk-engine';

// =============================================================================
// Defaults
// =============================================================================

const DEFAULTS: RiskConfig & { duplicatePositionScope: DuplicateScope } = {
    dailyMaxLoss: 1000,
    dailyProfitTarget: 2000,
    perTradeMaxRisk: 300,
    maxOpenPositions: 5,
    duplicatePositionScope: 'DESK_ONLY',
};

// =============================================================================
// Getter
// =============================================================================

/**
 * Get risk configuration from environment variables.
 * Falls back to sane defaults if env vars are not set.
 */
export function getRiskConfig(): RiskConfig & { duplicatePositionScope: DuplicateScope } {
    const scopeRaw = (process.env.DUPLICATE_POSITION_SCOPE || '').toUpperCase();
    const duplicatePositionScope: DuplicateScope =
        scopeRaw === 'GLOBAL' ? 'GLOBAL' : DEFAULTS.duplicatePositionScope;

    return {
        dailyMaxLoss: parseEnvNumber('DAILY_MAX_LOSS', DEFAULTS.dailyMaxLoss),
        dailyProfitTarget: parseEnvNumber('DAILY_PROFIT_TARGET', DEFAULTS.dailyProfitTarget),
        perTradeMaxRisk: parseEnvNumber('PER_TRADE_MAX_RISK', DEFAULTS.perTradeMaxRisk),
        maxOpenPositions: parseEnvNumber('MAX_OPEN_POSITIONS', DEFAULTS.maxOpenPositions),
        duplicatePositionScope,
    };
}

// =============================================================================
// Helpers
// =============================================================================

function parseEnvNumber(key: string, fallback: number): number {
    const raw = process.env[key];
    if (raw == null || raw === '') return fallback;
    const parsed = parseFloat(raw);
    return isNaN(parsed) ? fallback : parsed;
}
