import { GET } from '../route';
import { NextRequest } from 'next/server';
import { validateCronRequest } from '@/lib/ops/cron-auth';
import { getMarketClock } from '@/lib/market/market-hours';
import { writeJobRun } from '@/lib/ops/job-run-store';
import { acquireLock, releaseLock } from '@/lib/ops/job-lock';

jest.mock('@/lib/ops/cron-auth');
jest.mock('@/lib/market/market-hours');
jest.mock('@/lib/ops/job-lock');
jest.mock('@/lib/ops/job-run-store');
jest.mock('@/lib/broker/alpaca-client', () => ({
    getTradeActivities: jest.fn().mockResolvedValue([])
}));
jest.mock('@/lib/broker/alpaca-mapper', () => ({
    mapActivityToFill: jest.fn()
}));
jest.mock('@/lib/broker/fill-store', () => ({
    upsertFills: jest.fn().mockResolvedValue({ inserted: 0 })
}));
jest.mock('@/lib/broker/journal-linker', () => ({
    linkFillsToJournal: jest.fn().mockResolvedValue({ linked: 0, created: 0, reconciled: 0 })
}));

describe('GET /api/cron/post-close', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        process.env.ADMIN_SECRET_KEY = 'test-admin-key';

        (validateCronRequest as jest.Mock).mockReturnValue({ authorized: true });
        (acquireLock as jest.Mock).mockResolvedValue({ acquired: true, runId: 'test-run' });
        (releaseLock as jest.Mock).mockResolvedValue(true);
        (writeJobRun as jest.Mock).mockResolvedValue(true);
    });

    it('returns 404 if cron auth fails', async () => {
        (validateCronRequest as jest.Mock).mockReturnValue({ authorized: false });
        const req = new NextRequest('http://localhost:3000/api/cron/post-close');
        const res = await GET(req);
        expect(res.status).toBe(404);
    });

    it('returns skipped_outside_window if run outside window', async () => {
        (getMarketClock as jest.Mock).mockReturnValue({
            nowET: '2026-02-26T14:00:00-05:00', // 2:00 PM ET (too early)
            dayOfWeek: 4,
            isHoliday: false
        });

        const req = new NextRequest('http://localhost:3000/api/cron/post-close');
        const res = await GET(req);
        expect(res.status).toBe(200);

        const json = await res.json();
        expect(json.outcome).toBe('skipped_outside_window');
        expect(writeJobRun).toHaveBeenCalledWith(expect.objectContaining({
            outcome: 'skipped_outside_window'
        }));
    });

    it('runs normally if inside post-close window', async () => {
        (getMarketClock as jest.Mock).mockReturnValue({
            nowET: '2026-02-26T17:00:00-05:00', // 5:00 PM ET (inside window 16:10-20:00)
            dayOfWeek: 4,
            isHoliday: false
        });

        const req = new NextRequest('http://localhost:3000/api/cron/post-close');
        const res = await GET(req);
        expect(res.status).toBe(200);

        const json = await res.json();
        expect(json.outcome).toBe('ran');
        expect(writeJobRun).toHaveBeenCalledWith(expect.objectContaining({
            outcome: 'ran'
        }));
    });

    it('allows admin manual bypass outside window', async () => {
        (getMarketClock as jest.Mock).mockReturnValue({
            nowET: '2026-02-26T14:00:00-05:00', // 2:00 PM ET (too early)
            dayOfWeek: 4,
            isHoliday: false
        });

        const req = new NextRequest('http://localhost:3000/api/cron/post-close?force=true', {
            headers: { 'x-admin-token': 'test-admin-key' }
        });
        const res = await GET(req);
        expect(res.status).toBe(200);

        const json = await res.json();
        expect(json.outcome).toBe('ran'); // Bypass successful
        expect(writeJobRun).toHaveBeenCalledWith(expect.objectContaining({
            outcome: 'ran'
        }));
    });
});
