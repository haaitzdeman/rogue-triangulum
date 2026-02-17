/**
 * Health Aggregation Helper
 *
 * Computes overall system health from subsystem statuses.
 * Extracted from the health route handler to allow testing
 * without violating Next.js route export constraints.
 */

export type OverallStatus = 'PASS' | 'FAIL' | 'DEGRADED';

/**
 * Given an array of subsystem status strings, compute the overall verdict.
 * - All PASS → PASS
 * - Any FAIL or ERROR → FAIL
 * - Otherwise → DEGRADED
 */
export function computeOverallStatus(statuses: string[]): OverallStatus {
    const allPass = statuses.every(s => s === 'PASS');
    const anyError = statuses.some(s => s === 'ERROR' || s === 'FAIL');

    if (allPass) return 'PASS';
    if (anyError) return 'FAIL';
    return 'DEGRADED';
}
