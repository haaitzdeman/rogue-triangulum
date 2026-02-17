/**
 * Daytrading Desk Brain — Public API
 *
 * DO NOT change external response shapes or route paths.
 *
 * Placeholder desk — returns NOT_IMPLEMENTED for all operations.
 * No routes or UI exposed until explicitly requested.
 */

import type { DaytradeScanResult, DaytradeConfig } from './types';
export type { DaytradeScanResult, DaytradeConfig };
export { DEFAULT_DAYTRADE_CONFIG } from './types';

/**
 * Stub scanner — returns NOT_IMPLEMENTED
 */
export function runDaytradeScan(_symbol: string): DaytradeScanResult {
    return {
        symbol: _symbol,
        status: 'NOT_IMPLEMENTED',
    };
}
