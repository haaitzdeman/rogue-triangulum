import { POST } from '../route';
import { NextRequest } from 'next/server';
import { checkAdminAuth } from '@/lib/auth/admin-gate';
import { isServerSupabaseConfigured, createServerSupabase } from '@/lib/supabase/server';
import { checkFirstTradeUnlock } from '@/lib/ops/first-trade-unlock';
import { computeNextAction } from '@/lib/ops/next-action';
import { getMarketClock } from '@/lib/market/market-hours';

jest.mock('@/lib/auth/admin-gate');
jest.mock('@/lib/supabase/server', () => ({
    isServerSupabaseConfigured: jest.fn(() => true),
    createServerSupabase: jest.fn(() => ({})),
}));
jest.mock('@/lib/ops/first-trade-unlock', () => ({
    checkFirstTradeUnlock: jest.fn()
}));
jest.mock('@/lib/ops/next-action', () => ({
    computeNextAction: jest.fn()
}));
jest.mock('@/lib/market/market-hours');

describe('POST /api/dev/smoke/first-trade-unlock-check', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        (checkAdminAuth as jest.Mock).mockReturnValue({ authorized: true });
        (getMarketClock as jest.Mock).mockReturnValue({
            isMarketOpen: true,
            isExtendedHours: false,
            nextOpenET: 'tomorrow'
        });
        (checkFirstTradeUnlock as jest.Mock).mockResolvedValue({
            ok: true,
            reasons: [],
            sample: { desk: 'premarket', journalId: '123', entryId: '123' }
        });
        (computeNextAction as jest.Mock).mockReturnValue({
            nextAction: 'SYSTEM_OPERATIONAL',
            why: 'Ok',
            requiredHumanAction: null,
            suggestedEndpointToRun: null
        });
    });

    it('returns 404 if not admin authenticated', async () => {
        (checkAdminAuth as jest.Mock).mockReturnValue({ authorized: false });
        const req = new NextRequest('http://localhost:3000/api/dev/smoke/first-trade-unlock-check', { method: 'POST' });
        const res = await POST(req);
        expect(res.status).toBe(404);
    });

    it('returns FAIL if checkFirstTradeUnlock returns false ok with deterministic reasons', async () => {
        (checkFirstTradeUnlock as jest.Mock).mockResolvedValue({
            ok: false,
            reasons: ['No EXITED journal entries found. A complete trade lifecycle is required.']
        });
        (computeNextAction as jest.Mock).mockReturnValue({
            nextAction: 'WAITING_FOR_FIRST_TRADE'
        });

        const req = new NextRequest('http://localhost:3000/api/dev/smoke/first-trade-unlock-check', { method: 'POST' });
        const res = await POST(req);
        const json = await res.json();

        expect(json.status).toBe('FAIL');
        expect(json.nextAction).toBe('WAITING_FOR_FIRST_TRADE');
        expect(json.reasons[0]).toContain('EXITED');
    });

    it('returns PASS if mocked EXITED journal + ledger row + accounting pass', async () => {
        const req = new NextRequest('http://localhost:3000/api/dev/smoke/first-trade-unlock-check', { method: 'POST' });
        const res = await POST(req);
        const json = await res.json();

        expect(json.status).toBe('PASS');
        expect(json.nextAction).toBe('SYSTEM_OPERATIONAL');
        expect(json.details.desk).toBe('premarket');
        expect(json.details.journalId).toBe('123');
    });
});
