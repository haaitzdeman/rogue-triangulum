/**
 * Swing Desk Brain — Public API
 *
 * DO NOT change external response shapes or route paths.
 *
 * Placeholder desk — returns NOT_IMPLEMENTED for all operations.
 * No routes or UI exposed until explicitly requested.
 */

import type { SwingScanResult, SwingConfig } from './types';
export type { SwingScanResult, SwingConfig };
export { DEFAULT_SWING_CONFIG } from './types';

/**
 * Stub scanner — returns NOT_IMPLEMENTED
 */
export function runSwingScan(_symbol: string): SwingScanResult {
    return {
        symbol: _symbol,
        status: 'NOT_IMPLEMENTED',
    };
}
