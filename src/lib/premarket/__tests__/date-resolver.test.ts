/**
 * Date Resolver Tests
 * 
 * Tests for date resolution logic with DATASET_REPLAY and LIVE_PREMARKET modes.
 */

import {
    getDatasetRange,
    resolvePremarketDate,
    isDateOutOfRangeError,
    isTradingDay,
} from '../date-resolver';

describe('Date Resolver', () => {
    describe('getDatasetRange', () => {
        it('returns valid date range from manifest', () => {
            const range = getDatasetRange();

            expect(range).toHaveProperty('firstDate');
            expect(range).toHaveProperty('lastDate');
            expect(typeof range.firstDate).toBe('string');
            expect(typeof range.lastDate).toBe('string');

            // Dates should be in YYYY-MM-DD format
            expect(range.firstDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
            expect(range.lastDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
        });

        it('returns lastDate that is <= today (dataset is historical)', () => {
            const range = getDatasetRange();
            const today = new Date().toISOString().slice(0, 10);

            // Last date should be in the past or today
            expect(range.lastDate <= today).toBe(true);
        });
    });

    describe('resolvePremarketDate', () => {
        const range = getDatasetRange();

        it('returns DATASET_REPLAY with lastDate when no date specified and today > dataset', () => {
            // Since today (2026-01-29) is greater than dataset end (2026-01-27)
            // and no live provider is configured, should return DATASET_REPLAY
            const result = resolvePremarketDate({});

            if (!isDateOutOfRangeError(result)) {
                expect(result.mode).toBe('DATASET_REPLAY');
                expect(result.effectiveDate).toBe(range.lastDate);
                expect(result.requestedDate).toBe(null);
            }
        });

        it('returns DATE_OUT_OF_RANGE error when date > dataset and clamp=false', () => {
            const futureDate = '2030-01-01';
            const result = resolvePremarketDate({
                requestedDate: futureDate,
                clamp: false,
            });

            expect(isDateOutOfRangeError(result)).toBe(true);
            if (isDateOutOfRangeError(result)) {
                expect(result.errorCode).toBe('DATE_OUT_OF_RANGE');
                expect(result.requestedDate).toBe(futureDate);
                expect(result.suggestion).toBe(range.lastDate);
            }
        });

        it('clamps to lastDate when date > dataset and clamp=true', () => {
            const futureDate = '2030-01-01';
            const result = resolvePremarketDate({
                requestedDate: futureDate,
                clamp: true,
            });

            expect(isDateOutOfRangeError(result)).toBe(false);
            if (!isDateOutOfRangeError(result)) {
                expect(result.mode).toBe('DATASET_REPLAY');
                expect(result.effectiveDate).toBe(range.lastDate);
                expect(result.reason).toContain('clamped');
            }
        });

        it('returns DATASET_REPLAY when date is within range', () => {
            // Use the last date of dataset which should be valid
            const result = resolvePremarketDate({
                requestedDate: range.lastDate,
                clamp: false,
            });

            expect(isDateOutOfRangeError(result)).toBe(false);
            if (!isDateOutOfRangeError(result)) {
                expect(result.mode).toBe('DATASET_REPLAY');
                expect(result.effectiveDate).toBe(range.lastDate);
            }
        });

        it('includes datasetRange in response', () => {
            const result = resolvePremarketDate({
                requestedDate: range.lastDate,
            });

            if (!isDateOutOfRangeError(result)) {
                expect(result.datasetRange).toEqual(range);
            }
        });
    });

    describe('isDateOutOfRangeError', () => {
        it('returns true for error object', () => {
            const error = {
                errorCode: 'DATE_OUT_OF_RANGE' as const,
                datasetRange: { firstDate: '2021-01-01', lastDate: '2026-01-27' },
                requestedDate: '2030-01-01',
                suggestion: '2026-01-27',
            };

            expect(isDateOutOfRangeError(error)).toBe(true);
        });

        it('returns false for valid resolution', () => {
            const resolution = {
                requestedDate: '2026-01-27',
                effectiveDate: '2026-01-27',
                datasetRange: { firstDate: '2021-01-01', lastDate: '2026-01-27' },
                mode: 'DATASET_REPLAY' as const,
                reason: 'Valid date',
            };

            expect(isDateOutOfRangeError(resolution)).toBe(false);
        });
    });

    describe('isTradingDay', () => {
        it('returns true for weekday', () => {
            // Wednesday
            expect(isTradingDay(new Date('2026-01-28T12:00:00Z'))).toBe(true);
        });

        it('returns false for Saturday', () => {
            expect(isTradingDay(new Date('2026-01-31T12:00:00Z'))).toBe(false);
        });

        it('returns false for Sunday', () => {
            expect(isTradingDay(new Date('2026-02-01T12:00:00Z'))).toBe(false);
        });
    });
});
