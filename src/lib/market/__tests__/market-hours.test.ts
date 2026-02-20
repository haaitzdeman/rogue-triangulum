import { getMarketClock } from '../market-hours';

describe('getMarketClock', () => {
    // Helper: create a Date from an ET time string
    // We approximate by using UTC offsets (ET = UTC-5 in winter, UTC-4 in summer)
    // For Feb 2026 (EST), ET = UTC-5
    function etDate(dateStr: string, hour: number, minute: number): Date {
        const [year, month, day] = dateStr.split('-').map(Number);
        // Create in UTC, offset by +5 hours to simulate EST
        return new Date(Date.UTC(year, month - 1, day, hour + 5, minute, 0));
    }

    describe('Regular Market Hours', () => {
        it('should return isMarketOpen=true during regular hours (Wed 10:30 AM ET)', () => {
            // Wednesday Feb 18, 2026 10:30 AM ET
            const clock = getMarketClock(etDate('2026-02-18', 10, 30));
            expect(clock.isMarketOpen).toBe(true);
            expect(clock.isExtendedHours).toBe(false);
            expect(clock.extendedSession).toBeNull();
        });

        it('should return isMarketOpen=true at exactly 9:30 AM ET', () => {
            const clock = getMarketClock(etDate('2026-02-18', 9, 30));
            expect(clock.isMarketOpen).toBe(true);
        });

        it('should return isMarketOpen=false at exactly 4:00 PM ET (close)', () => {
            const clock = getMarketClock(etDate('2026-02-18', 16, 0));
            expect(clock.isMarketOpen).toBe(false);
        });
    });

    describe('Pre-Market Hours', () => {
        it('should detect pre-market at 7:00 AM ET on a weekday', () => {
            const clock = getMarketClock(etDate('2026-02-18', 7, 0));
            expect(clock.isMarketOpen).toBe(false);
            expect(clock.isExtendedHours).toBe(true);
            expect(clock.extendedSession).toBe('PRE_MARKET');
        });

        it('should detect pre-market at 4:00 AM ET (start)', () => {
            const clock = getMarketClock(etDate('2026-02-18', 4, 0));
            expect(clock.isExtendedHours).toBe(true);
            expect(clock.extendedSession).toBe('PRE_MARKET');
        });

        it('should NOT be pre-market at 3:59 AM ET', () => {
            const clock = getMarketClock(etDate('2026-02-18', 3, 59));
            expect(clock.isExtendedHours).toBe(false);
        });
    });

    describe('Post-Market Hours', () => {
        it('should detect post-market at 5:00 PM ET on a weekday', () => {
            const clock = getMarketClock(etDate('2026-02-18', 17, 0));
            expect(clock.isMarketOpen).toBe(false);
            expect(clock.isExtendedHours).toBe(true);
            expect(clock.extendedSession).toBe('POST_MARKET');
        });

        it('should detect post-market at 4:00 PM ET (close)', () => {
            const clock = getMarketClock(etDate('2026-02-18', 16, 0));
            expect(clock.isExtendedHours).toBe(true);
            expect(clock.extendedSession).toBe('POST_MARKET');
        });

        it('should NOT be post-market at 8:00 PM ET (end)', () => {
            const clock = getMarketClock(etDate('2026-02-18', 20, 0));
            expect(clock.isExtendedHours).toBe(false);
        });
    });

    describe('Market Closed', () => {
        it('should be closed on Saturday', () => {
            // Feb 21, 2026 is Saturday
            const clock = getMarketClock(etDate('2026-02-21', 10, 30));
            expect(clock.isMarketOpen).toBe(false);
            expect(clock.isExtendedHours).toBe(false);
        });

        it('should be closed on Sunday', () => {
            // Feb 22, 2026 is Sunday
            const clock = getMarketClock(etDate('2026-02-22', 10, 30));
            expect(clock.isMarketOpen).toBe(false);
            expect(clock.isExtendedHours).toBe(false);
        });

        it('should return next open on Monday for weekend dates', () => {
            const clock = getMarketClock(etDate('2026-02-21', 10, 30));
            expect(clock.nextOpenET).toContain('09:30:00');
        });

        it('should be closed at 9:00 PM ET on a weekday (after post-market)', () => {
            const clock = getMarketClock(etDate('2026-02-18', 21, 0));
            expect(clock.isMarketOpen).toBe(false);
            expect(clock.isExtendedHours).toBe(false);
        });
    });

    describe('NYSE Holidays', () => {
        it('should be closed on MLK Day (Jan 19, 2026)', () => {
            const clock = getMarketClock(etDate('2026-01-19', 10, 30));
            expect(clock.isMarketOpen).toBe(false);
            expect(clock.isHoliday).toBe(true);
            expect(clock.holidayName).toBe('Martin Luther King Jr. Day');
        });

        it('should have no extended hours on holidays', () => {
            const clock = getMarketClock(etDate('2026-01-19', 7, 0));
            expect(clock.isExtendedHours).toBe(false);
        });
    });

    describe('Next Open/Close Times', () => {
        it('should return today close time when market is open', () => {
            const clock = getMarketClock(etDate('2026-02-18', 10, 30));
            expect(clock.nextCloseET).toContain('2026-02-18');
            expect(clock.nextCloseET).toContain('16:00:00');
        });

        it('should return today open time when before market open', () => {
            const clock = getMarketClock(etDate('2026-02-18', 3, 0));
            expect(clock.nextOpenET).toContain('2026-02-18');
            expect(clock.nextOpenET).toContain('09:30:00');
        });
    });

    describe('Return Shape', () => {
        it('should return all expected fields', () => {
            const clock = getMarketClock(etDate('2026-02-18', 10, 30));
            expect(clock).toHaveProperty('nowET');
            expect(clock).toHaveProperty('dayOfWeek');
            expect(clock).toHaveProperty('isMarketOpen');
            expect(clock).toHaveProperty('isExtendedHours');
            expect(clock).toHaveProperty('extendedSession');
            expect(clock).toHaveProperty('nextOpenET');
            expect(clock).toHaveProperty('nextCloseET');
            expect(clock).toHaveProperty('isHoliday');
            expect(clock).toHaveProperty('holidayName');
        });
    });
});
