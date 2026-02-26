import { GET } from '../route';
import { NextRequest } from 'next/server';
import { checkAdminAuth } from '@/lib/auth/admin-gate';
import { getLatestJobRuns, getLatestDailyCheck } from '@/lib/ops/job-run-store';
import { POST as firstTradeUnlockCheck } from '@/app/api/dev/smoke/first-trade-unlock-check/route';
import { getMarketClock } from '@/lib/market/market-hours';

jest.mock('@/lib/auth/admin-gate');
jest.mock('@/lib/ops/job-run-store');
jest.mock('@/lib/market/market-hours');
jest.mock('@/app/api/dev/smoke/first-trade-unlock-check/route');

describe('GET /api/dev/ops/next-action', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        (checkAdminAuth as jest.Mock).mockReturnValue({ authorized: true });
        (getLatestJobRuns as jest.Mock).mockResolvedValue({});
        (getLatestDailyCheck as jest.Mock).mockResolvedValue(null);
        (getMarketClock as jest.Mock).mockReturnValue({
            isMarketOpen: true,
            isExtendedHours: false,
            nextOpenET: 'tomorrow'
        });
    });

    it('returns 404 if not admin authenticated', async () => {
        (checkAdminAuth as jest.Mock).mockReturnValue({ authorized: false });
        const req = new NextRequest('http://localhost:3000/api/dev/ops/next-action');
        const res = await GET(req);
        expect(res.status).toBe(404);
    });

    it('returns INVESTIGATE_DEGRADED if daily check failed', async () => {
        (getLatestDailyCheck as jest.Mock).mockResolvedValue({ verdict: 'FAIL' });

        const req = new NextRequest('http://localhost:3000/api/dev/ops/next-action', {
            headers: { 'x-admin-token': 'valid' }
        });
        const res = await GET(req);
        const json = await res.json();

        expect(json.nextAction).toBe('INVESTIGATE_DEGRADED');
        expect(json.why).toContain('daily_check_failed');
    });

    it('returns RUN_POST_CLOSE if unlock check returns it', async () => {
        (firstTradeUnlockCheck as jest.Mock).mockResolvedValue({
            json: async () => ({ status: 'FAIL', nextAction: 'RUN_POST_CLOSE' })
        });

        const req = new NextRequest('http://localhost:3000/api/dev/ops/next-action', {
            headers: { 'x-admin-token': 'valid' }
        });
        const res = await GET(req);
        const json = await res.json();

        expect(json.nextAction).toBe('RUN_POST_CLOSE');
    });

    it('returns PLACE_FIRST_TRADE if unlock check returns WAITING_FOR_FIRST_TRADE and market is open', async () => {
        (firstTradeUnlockCheck as jest.Mock).mockResolvedValue({
            json: async () => ({ status: 'FAIL', nextAction: 'WAITING_FOR_FIRST_TRADE' })
        });

        const req = new NextRequest('http://localhost:3000/api/dev/ops/next-action', {
            headers: { 'x-admin-token': 'valid' }
        });
        const res = await GET(req);
        const json = await res.json();

        expect(json.nextAction).toBe('PLACE_FIRST_TRADE');
    });

    it('returns WAIT_FOR_MARKET_OPEN if unlock check is WAITING_FOR_FIRST_TRADE and market is closed', async () => {
        (getMarketClock as jest.Mock).mockReturnValue({
            isMarketOpen: false,
            isExtendedHours: false,
            nextOpenET: 'tomorrow'
        });
        (firstTradeUnlockCheck as jest.Mock).mockResolvedValue({
            json: async () => ({ status: 'FAIL', nextAction: 'WAITING_FOR_FIRST_TRADE' })
        });

        const req = new NextRequest('http://localhost:3000/api/dev/ops/next-action', {
            headers: { 'x-admin-token': 'valid' }
        });
        const res = await GET(req);
        const json = await res.json();

        expect(json.nextAction).toBe('WAIT_FOR_MARKET_OPEN');
    });

    it('returns SYSTEM_OPERATIONAL if everything passes', async () => {
        (firstTradeUnlockCheck as jest.Mock).mockResolvedValue({
            json: async () => ({ status: 'PASS', nextAction: 'SYSTEM_OPERATIONAL' })
        });

        const req = new NextRequest('http://localhost:3000/api/dev/ops/next-action', {
            headers: { 'x-admin-token': 'valid' }
        });
        const res = await GET(req);
        const json = await res.json();

        expect(json.nextAction).toBe('SYSTEM_OPERATIONAL');
    });
});
