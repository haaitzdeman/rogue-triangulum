import { GET } from '../route';
import { NextRequest } from 'next/server';
import { checkAdminAuth } from '@/lib/auth/admin-gate';
import { getLatestJobRuns, getLatestDailyCheck } from '@/lib/ops/job-run-store';

jest.mock('@/lib/auth/admin-gate');
jest.mock('@/lib/ops/job-run-store');
jest.mock('@/lib/market/market-hours', () => ({
    getMarketClock: jest.fn().mockReturnValue({
        nowET: '2026-02-26T10:00:00-05:00',
        isMarketOpen: true,
        isExtendedHours: false,
        nextOpenET: '2026-02-27T09:30:00-05:00'
    })
}));

describe('GET /api/dev/ops/status', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        process.env.CRON_INTRADAY_SYNC_ENABLED = 'false';

        (checkAdminAuth as jest.Mock).mockReturnValue({ authorized: true });
        (getLatestJobRuns as jest.Mock).mockResolvedValue({});
        (getLatestDailyCheck as jest.Mock).mockResolvedValue(null);
    });

    it('returns 404 if not admin authenticated', async () => {
        (checkAdminAuth as jest.Mock).mockReturnValue({ authorized: false });
        const req = new NextRequest('http://localhost:3000/api/dev/ops/status');
        const res = await GET(req);
        expect(res.status).toBe(404);
    });

    it('includes cronCapability DAILY_ONLY (HOBBY)', async () => {
        const req = new NextRequest('http://localhost:3000/api/dev/ops/status', {
            headers: { 'x-admin-token': 'valid' }
        });
        const res = await GET(req);
        expect(res.status).toBe(200);

        const json = await res.json();
        expect(json.cronCapability).toBe('DAILY_ONLY (HOBBY)');
        expect(json.systemWarnings).toEqual([]);
    });

    it('adds warning if CRON_INTRADAY_SYNC_ENABLED is true', async () => {
        process.env.CRON_INTRADAY_SYNC_ENABLED = 'true';

        const req = new NextRequest('http://localhost:3000/api/dev/ops/status', {
            headers: { 'x-admin-token': 'valid' }
        });
        const res = await GET(req);
        const json = await res.json();

        expect(json.systemWarnings).toContain(
            'CRON_INTRADAY_SYNC_ENABLED is true, but Hobby tier only supports daily cron. Intraday sync will not execute automatically.'
        );
    });
});
