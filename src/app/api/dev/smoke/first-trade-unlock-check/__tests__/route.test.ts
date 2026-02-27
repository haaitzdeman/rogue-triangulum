import { POST } from '../route';
import { NextRequest } from 'next/server';
import { checkAdminAuth } from '@/lib/auth/admin-gate';
import { isServerSupabaseConfigured, createServerSupabase } from '@/lib/supabase/server';
import { computeFirstTradeProcessed } from '@/lib/ops/next-action';

jest.mock('@/lib/auth/admin-gate');
jest.mock('@/lib/supabase/server', () => ({
    isServerSupabaseConfigured: jest.fn(() => true),
    createServerSupabase: jest.fn(() => ({})),
}));
jest.mock('@/lib/ops/next-action', () => ({
    computeFirstTradeProcessed: jest.fn()
}));

describe('POST /api/dev/smoke/first-trade-unlock-check', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        (checkAdminAuth as jest.Mock).mockReturnValue({ authorized: true });
        (computeFirstTradeProcessed as jest.Mock).mockResolvedValue({
            ok: true,
            reasons: [],
            nextAction: 'SYSTEM_OPERATIONAL',
            details: { symbol: 'AAPL' }
        });
    });

    it('returns 404 if not admin authenticated', async () => {
        (checkAdminAuth as jest.Mock).mockReturnValue({ authorized: false });
        const req = new NextRequest('http://localhost:3000/api/dev/smoke/first-trade-unlock-check', { method: 'POST' });
        const res = await POST(req);
        expect(res.status).toBe(404);
    });

    it('returns FAIL if computeFirstTradeProcessed returns false ok', async () => {
        (computeFirstTradeProcessed as jest.Mock).mockResolvedValue({
            ok: false,
            reasons: ['No trade'],
            nextAction: 'WAITING_FOR_FIRST_TRADE'
        });

        const req = new NextRequest('http://localhost:3000/api/dev/smoke/first-trade-unlock-check', { method: 'POST' });
        const res = await POST(req);
        const json = await res.json();

        expect(json.status).toBe('FAIL');
        expect(json.nextAction).toBe('WAITING_FOR_FIRST_TRADE');
    });

    it('returns PASS if full verification succeeds via helper', async () => {
        const req = new NextRequest('http://localhost:3000/api/dev/smoke/first-trade-unlock-check', { method: 'POST' });
        const res = await POST(req);
        const json = await res.json();

        expect(json.status).toBe('PASS');
        expect(json.nextAction).toBe('SYSTEM_OPERATIONAL');
        expect(json.details.symbol).toBe('AAPL');
    });
});
