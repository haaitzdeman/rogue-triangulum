import { GET } from '../route';
import { NextRequest } from 'next/server';
import { checkAdminAuth } from '@/lib/auth/admin-gate';
import { getLatestJobRuns, getLatestDailyCheck } from '@/lib/ops/job-run-store';
import { computeFirstTradeProcessed } from '@/lib/ops/next-action';
import { getMarketClock } from '@/lib/market/market-hours';

jest.mock('@/lib/auth/admin-gate');
jest.mock('@/lib/ops/job-run-store');
jest.mock('@/lib/market/market-hours');
jest.mock('@/lib/ops/next-action', () => {
    const originalModule = jest.requireActual('@/lib/ops/next-action');
    return {
        ...originalModule,
        computeFirstTradeProcessed: jest.fn(),
    };
});
jest.mock('@/lib/supabase/server', () => ({
    isServerSupabaseConfigured: jest.fn(() => true),
    createServerSupabase: jest.fn(() => ({})),
}));

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
        (computeFirstTradeProcessed as jest.Mock).mockResolvedValue({
            ok: false,
            reasons: ['No trade'],
            nextAction: 'WAITING_FOR_FIRST_TRADE'
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

    it('returns RUN_POST_CLOSE if first trade unlock returns it', async () => {
        (computeFirstTradeProcessed as jest.Mock).mockResolvedValue({
            ok: false,
            reasons: [],
            nextAction: 'RUN_POST_CLOSE'
        });

        const req = new NextRequest('http://localhost:3000/api/dev/ops/next-action', {
            headers: { 'x-admin-token': 'valid' }
        });
        const res = await GET(req);
        const json = await res.json();

        expect(json.nextAction).toBe('RUN_POST_CLOSE');
    });

    it('returns PLACE_FIRST_TRADE if first trade unlock is waiting and market is open', async () => {
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

        const req = new NextRequest('http://localhost:3000/api/dev/ops/next-action', {
            headers: { 'x-admin-token': 'valid' }
        });
        const res = await GET(req);
        const json = await res.json();

        expect(json.nextAction).toBe('WAIT_FOR_MARKET_OPEN');
    });

    it('returns SYSTEM_OPERATIONAL if everything passes', async () => {
        (computeFirstTradeProcessed as jest.Mock).mockResolvedValue({
            ok: true,
            reasons: [],
            nextAction: 'SYSTEM_OPERATIONAL'
        });

        const req = new NextRequest('http://localhost:3000/api/dev/ops/next-action', {
            headers: { 'x-admin-token': 'valid' }
        });
        const res = await GET(req);
        const json = await res.json();

        expect(json.nextAction).toBe('SYSTEM_OPERATIONAL');
    });
});
