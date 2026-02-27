import { GET } from '../route';
import { NextRequest } from 'next/server';
import { checkAdminAuth } from '@/lib/auth/admin-gate';
import { getLatestJobRuns, getLatestDailyCheck } from '@/lib/ops/job-run-store';
import { checkFirstTradeUnlock } from '@/lib/ops/first-trade-unlock';
import { computeNextAction } from '@/lib/ops/next-action';
import { getMarketClock } from '@/lib/market/market-hours';

jest.mock('@/lib/auth/admin-gate');
jest.mock('@/lib/ops/job-run-store');
jest.mock('@/lib/market/market-hours');
jest.mock('@/lib/ops/first-trade-unlock', () => ({
    checkFirstTradeUnlock: jest.fn()
}));
jest.mock('@/lib/ops/next-action', () => ({
    computeNextAction: jest.fn()
}));
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
        (checkFirstTradeUnlock as jest.Mock).mockResolvedValue({
            ok: false,
            reasons: ['No EXITED journal entry']
        });
        (computeNextAction as jest.Mock).mockReturnValue({
            nextAction: 'WAITING_FOR_FIRST_TRADE',
            why: 'Ok',
            requiredHumanAction: 'Buy 1 share -> run sync -> sell -> run sync',
            suggestedEndpointToRun: '/api/dev/smoke/guided-first-trade'
        });
    });

    it('returns 404 if not admin authenticated', async () => {
        (checkAdminAuth as jest.Mock).mockReturnValue({ authorized: false });
        const req = new NextRequest('http://localhost:3000/api/dev/ops/next-action');
        const res = await GET(req);
        expect(res.status).toBe(404);
    });

    it('returns nextAction determined by computeNextAction helper based on shared state', async () => {
        const req = new NextRequest('http://localhost:3000/api/dev/ops/next-action', {
            headers: { 'x-admin-token': 'valid' }
        });
        const res = await GET(req);
        const json = await res.json();

        expect(json.nextAction).toBe('WAITING_FOR_FIRST_TRADE');
        expect(json.requiredHumanAction).toContain('Buy 1 share');
    });

    it('returns SYSTEM_OPERATIONAL via computeNextAction if unlockOk is true', async () => {
        (checkFirstTradeUnlock as jest.Mock).mockResolvedValue({
            ok: true,
            reasons: []
        });
        (computeNextAction as jest.Mock).mockReturnValue({
            nextAction: 'SYSTEM_OPERATIONAL',
            why: 'Operational',
            requiredHumanAction: null,
            suggestedEndpointToRun: null
        });

        const req = new NextRequest('http://localhost:3000/api/dev/ops/next-action', {
            headers: { 'x-admin-token': 'valid' }
        });
        const res = await GET(req);
        const json = await res.json();

        expect(json.nextAction).toBe('SYSTEM_OPERATIONAL');
    });
});
