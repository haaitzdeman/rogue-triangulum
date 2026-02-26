import { POST } from '../route';
import { NextRequest } from 'next/server';
import { checkAdminAuth } from '@/lib/auth/admin-gate';
import { isServerSupabaseConfigured, createServerSupabase } from '@/lib/supabase/server';
import { loadDailySummary } from '@/lib/accounting/trade-ledger-store';

jest.mock('@/lib/auth/admin-gate');
jest.mock('@/lib/supabase/server');
jest.mock('@/lib/accounting/trade-ledger-store');

const mockSupabase = {
    from: jest.fn().mockReturnThis(),
    select: jest.fn().mockReturnThis(),
    eq: jest.fn().mockReturnThis(),
    limit: jest.fn().mockReturnThis(),
    maybeSingle: jest.fn()
};

describe('POST /api/dev/smoke/first-trade-unlock-check', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        (checkAdminAuth as jest.Mock).mockReturnValue({ authorized: true });
        (isServerSupabaseConfigured as jest.Mock).mockReturnValue(true);
        (createServerSupabase as jest.Mock).mockReturnValue(mockSupabase);
        (loadDailySummary as jest.Mock).mockResolvedValue({
            tradeCount: 1,
            symbols: ['AAPL']
        });
    });

    it('returns 404 if not admin authenticated', async () => {
        (checkAdminAuth as jest.Mock).mockReturnValue({ authorized: false });
        const req = new NextRequest('http://localhost:3000/api/dev/smoke/first-trade-unlock-check', { method: 'POST' });
        const res = await POST(req);
        expect(res.status).toBe(404);
    });

    it('returns FAIL if supabase not configured', async () => {
        (isServerSupabaseConfigured as jest.Mock).mockReturnValue(false);
        const req = new NextRequest('http://localhost:3000/api/dev/smoke/first-trade-unlock-check', { method: 'POST' });
        const res = await POST(req);
        const json = await res.json();
        expect(json.status).toBe('FAIL');
        expect(json.nextAction).toBe('CONFIGURE_SUPABASE');
    });

    it('returns FAIL if no EXITED entries found', async () => {
        mockSupabase.maybeSingle.mockResolvedValue({ data: null });

        const req = new NextRequest('http://localhost:3000/api/dev/smoke/first-trade-unlock-check', { method: 'POST' });
        const res = await POST(req);
        const json = await res.json();

        expect(json.status).toBe('FAIL');
        expect(json.nextAction).toBe('WAITING_FOR_FIRST_TRADE');
    });

    it('returns FAIL if entry exists but not in ledger', async () => {
        // Journal entry mock
        mockSupabase.maybeSingle.mockResolvedValueOnce({
            data: { id: 'entry-123', symbol: 'AAPL', updated_at: '2026-02-26T10:00:00Z' }
        });
        // Ledger entry mock
        mockSupabase.maybeSingle.mockResolvedValueOnce({ data: null, error: null });

        const req = new NextRequest('http://localhost:3000/api/dev/smoke/first-trade-unlock-check', { method: 'POST' });
        const res = await POST(req);
        const json = await res.json();

        expect(json.status).toBe('FAIL');
        expect(json.nextAction).toBe('RUN_POST_CLOSE');
    });

    it('returns PASS if full verification succeeds', async () => {
        mockSupabase.maybeSingle.mockResolvedValueOnce({
            data: { id: 'entry-123', symbol: 'AAPL', updated_at: '2026-02-26T10:00:00Z' }
        });
        mockSupabase.maybeSingle.mockResolvedValueOnce({
            data: { id: 'ledger-456', entry_id: 'entry-123', symbol: 'AAPL', exit_timestamp: '2026-02-26T10:00:00Z' }
        });

        const req = new NextRequest('http://localhost:3000/api/dev/smoke/first-trade-unlock-check', { method: 'POST' });
        const res = await POST(req);
        const json = await res.json();

        expect(json.status).toBe('PASS');
        expect(json.nextAction).toBe('SYSTEM_OPERATIONAL');
        expect(json.details.symbol).toBe('AAPL');
    });
});
