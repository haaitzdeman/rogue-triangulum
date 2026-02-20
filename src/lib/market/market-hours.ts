/**
 * Market Hours — NYSE Schedule
 *
 * Hardcoded NYSE schedule with timezone conversion to Eastern Time.
 *
 * Regular Hours:  9:30 AM – 4:00 PM ET  (Mon–Fri)
 * Pre-Market:     4:00 AM – 9:30 AM ET
 * Post-Market:    4:00 PM – 8:00 PM ET
 *
 * Holidays: 2026 NYSE observed holidays included.
 *
 * All times are returned in America/New_York timezone.
 */

// =============================================================================
// Types
// =============================================================================

export interface MarketClock {
    /** Current time in ET (ISO string) */
    nowET: string;
    /** Current day of week (0=Sun, 6=Sat) */
    dayOfWeek: number;
    /** Whether current time falls within regular trading hours */
    isMarketOpen: boolean;
    /** Whether current time falls within pre-market or post-market */
    isExtendedHours: boolean;
    /** Which extended session, if any */
    extendedSession: 'PRE_MARKET' | 'POST_MARKET' | null;
    /** Next regular market open time in ET */
    nextOpenET: string;
    /** Next regular market close time in ET */
    nextCloseET: string;
    /** Whether today is a holiday */
    isHoliday: boolean;
    /** Holiday name if applicable */
    holidayName: string | null;
}

// =============================================================================
// NYSE Holiday Calendar — 2026
// =============================================================================

const NYSE_HOLIDAYS_2026: Record<string, string> = {
    '2026-01-01': "New Year's Day",
    '2026-01-19': 'Martin Luther King Jr. Day',
    '2026-02-16': "Presidents' Day",
    '2026-04-03': 'Good Friday',
    '2026-05-25': 'Memorial Day',
    '2026-06-19': 'Juneteenth',
    '2026-07-03': 'Independence Day (Observed)',
    '2026-09-07': 'Labor Day',
    '2026-11-26': 'Thanksgiving Day',
    '2026-12-25': 'Christmas Day',
};

// =============================================================================
// Time Constants (minutes from midnight ET)
// =============================================================================

const PRE_MARKET_OPEN = 4 * 60;           // 4:00 AM
const REGULAR_OPEN = 9 * 60 + 30;         // 9:30 AM
const REGULAR_CLOSE = 16 * 60;            // 4:00 PM
const POST_MARKET_CLOSE = 20 * 60;        // 8:00 PM

// =============================================================================
// Core Logic
// =============================================================================

/**
 * Convert a UTC Date to Eastern Time components.
 * Uses Intl.DateTimeFormat for proper DST handling.
 */
function toEasternTime(utcDate: Date): {
    etString: string;
    year: number;
    month: number;
    day: number;
    hour: number;
    minute: number;
    dayOfWeek: number;
} {
    const formatter = new Intl.DateTimeFormat('en-US', {
        timeZone: 'America/New_York',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: false,
    });

    const parts = formatter.formatToParts(utcDate);
    const get = (type: string) => parts.find((p) => p.type === type)?.value ?? '0';

    const year = parseInt(get('year'));
    const month = parseInt(get('month'));
    const day = parseInt(get('day'));
    const hour = parseInt(get('hour')) % 24; // Handle midnight as 0
    const minute = parseInt(get('minute'));

    // Get day of week in ET
    const dowFormatter = new Intl.DateTimeFormat('en-US', {
        timeZone: 'America/New_York',
        weekday: 'short',
    });
    const dowStr = dowFormatter.format(utcDate);
    const dowMap: Record<string, number> = {
        Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6,
    };

    const etString = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}T${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}:00`;

    return {
        etString,
        year,
        month,
        day,
        hour,
        minute,
        dayOfWeek: dowMap[dowStr] ?? 0,
    };
}

/**
 * Format a date string in ET as YYYY-MM-DD.
 */
function toDateKey(year: number, month: number, day: number): string {
    return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

/**
 * Check if a date is an NYSE holiday.
 */
function isNYSEHoliday(dateKey: string): { isHoliday: boolean; name: string | null } {
    const name = NYSE_HOLIDAYS_2026[dateKey] ?? null;
    return { isHoliday: !!name, name };
}

/**
 * Find the next trading day from a given date (skips weekends and holidays).
 */
function nextTradingDay(year: number, month: number, day: number): {
    year: number;
    month: number;
    day: number;
} {
    // Start from next day
    const d = new Date(year, month - 1, day + 1);

    for (let i = 0; i < 10; i++) {
        const dow = d.getDay();
        const key = toDateKey(d.getFullYear(), d.getMonth() + 1, d.getDate());

        if (dow >= 1 && dow <= 5 && !NYSE_HOLIDAYS_2026[key]) {
            return {
                year: d.getFullYear(),
                month: d.getMonth() + 1,
                day: d.getDate(),
            };
        }
        d.setDate(d.getDate() + 1);
    }

    // Fallback: return next Monday
    return { year, month, day: day + 3 };
}

/**
 * Get the current market clock state.
 *
 * @param now - Optional Date for testing. Defaults to Date.now().
 */
export function getMarketClock(now?: Date): MarketClock {
    const utcNow = now ?? new Date();
    const et = toEasternTime(utcNow);
    const minutesSinceMidnight = et.hour * 60 + et.minute;
    const dateKey = toDateKey(et.year, et.month, et.day);
    const holiday = isNYSEHoliday(dateKey);

    const isWeekday = et.dayOfWeek >= 1 && et.dayOfWeek <= 5;
    const isTradingDay = isWeekday && !holiday.isHoliday;

    // Regular hours
    const isMarketOpen =
        isTradingDay &&
        minutesSinceMidnight >= REGULAR_OPEN &&
        minutesSinceMidnight < REGULAR_CLOSE;

    // Extended hours
    const isPreMarket =
        isTradingDay &&
        minutesSinceMidnight >= PRE_MARKET_OPEN &&
        minutesSinceMidnight < REGULAR_OPEN;

    const isPostMarket =
        isTradingDay &&
        minutesSinceMidnight >= REGULAR_CLOSE &&
        minutesSinceMidnight < POST_MARKET_CLOSE;

    const isExtendedHours = isPreMarket || isPostMarket;
    const extendedSession = isPreMarket
        ? 'PRE_MARKET'
        : isPostMarket
            ? 'POST_MARKET'
            : null;

    // Compute next open/close
    let nextOpenET: string;
    let nextCloseET: string;

    if (isMarketOpen) {
        // Currently open — next open is tomorrow (or next trading day)
        const next = nextTradingDay(et.year, et.month, et.day);
        nextOpenET = `${toDateKey(next.year, next.month, next.day)}T09:30:00 ET`;
        nextCloseET = `${dateKey}T16:00:00 ET`;
    } else if (isTradingDay && minutesSinceMidnight < REGULAR_OPEN) {
        // Before open today
        nextOpenET = `${dateKey}T09:30:00 ET`;
        nextCloseET = `${dateKey}T16:00:00 ET`;
    } else {
        // After close or non-trading day
        const next = isTradingDay
            ? nextTradingDay(et.year, et.month, et.day)
            : nextTradingDay(et.year, et.month, et.day - 1 + 1); // handles weekends
        // If it's a weekend, find next Monday-like trading day
        const nextDate =
            !isWeekday || holiday.isHoliday
                ? nextTradingDay(et.year, et.month, et.day)
                : next;
        nextOpenET = `${toDateKey(nextDate.year, nextDate.month, nextDate.day)}T09:30:00 ET`;
        nextCloseET = `${toDateKey(nextDate.year, nextDate.month, nextDate.day)}T16:00:00 ET`;
    }

    return {
        nowET: et.etString + ' ET',
        dayOfWeek: et.dayOfWeek,
        isMarketOpen,
        isExtendedHours,
        extendedSession,
        nextOpenET,
        nextCloseET,
        isHoliday: holiday.isHoliday,
        holidayName: holiday.name,
    };
}
