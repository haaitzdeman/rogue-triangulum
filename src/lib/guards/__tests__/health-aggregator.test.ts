/**
 * Health Aggregator Status Logic Tests
 *
 * Tests the computeOverallStatus() function that determines the
 * aggregated health verdict from subsystem statuses.
 */

import { computeOverallStatus } from '@/lib/guards/health-status';

describe('computeOverallStatus', () => {
    test('returns PASS when all subsystems pass', () => {
        expect(computeOverallStatus(['PASS', 'PASS', 'PASS'])).toBe('PASS');
    });

    test('returns FAIL when any subsystem is FAIL', () => {
        expect(computeOverallStatus(['PASS', 'FAIL', 'PASS'])).toBe('FAIL');
    });

    test('returns FAIL when any subsystem is ERROR', () => {
        expect(computeOverallStatus(['PASS', 'PASS', 'ERROR'])).toBe('FAIL');
    });

    test('returns DEGRADED when a subsystem is UNKNOWN (not PASS, not FAIL/ERROR)', () => {
        expect(computeOverallStatus(['PASS', 'UNKNOWN', 'PASS'])).toBe('DEGRADED');
    });

    test('returns FAIL when mix of FAIL and UNKNOWN', () => {
        expect(computeOverallStatus(['FAIL', 'UNKNOWN', 'PASS'])).toBe('FAIL');
    });

    test('returns DEGRADED when a subsystem is DEGRADED', () => {
        expect(computeOverallStatus(['PASS', 'DEGRADED', 'PASS'])).toBe('DEGRADED');
    });
});
