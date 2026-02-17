/**
 * Schema Gate Tests
 *
 * Tests the requireSchemaOr503 helper for deploy-gate enforcement.
 */

// Mock the supabase server module before imports
jest.mock('@/lib/supabase/server', () => ({
    isServerSupabaseConfigured: jest.fn(),
    createServerSupabase: jest.fn(),
}));

import { requireSchemaOr503 } from '../schema-gate';
import { isServerSupabaseConfigured, createServerSupabase } from '@/lib/supabase/server';

const mockIsConfigured = isServerSupabaseConfigured as jest.MockedFunction<typeof isServerSupabaseConfigured>;
const mockCreateServer = createServerSupabase as jest.MockedFunction<typeof createServerSupabase>;

describe('requireSchemaOr503', () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    it('returns 503 when server DB is not configured', async () => {
        mockIsConfigured.mockReturnValue(false);

        const result = await requireSchemaOr503(['trade_ledger'], 'TestContext');

        expect(result.pass).toBe(false);
        if (!result.pass) {
            const body = await result.response.json();
            expect(result.response.status).toBe(503);
            expect(body.errorCode).toBe('DB_NOT_CONFIGURED');
            expect(body.message).toContain('TestContext');
            expect(body.missing).toEqual(['trade_ledger']);
        }
    });

    it('returns 503 when required tables are missing', async () => {
        mockIsConfigured.mockReturnValue(true);
        const mockFrom = jest.fn().mockReturnValue({
            select: jest.fn().mockReturnValue({
                limit: jest.fn().mockResolvedValue({
                    error: { code: '42P01', message: 'relation does not exist' },
                }),
            }),
        });
        mockCreateServer.mockReturnValue({ from: mockFrom } as never);

        const result = await requireSchemaOr503(['missing_table'], 'BrokerSync');

        expect(result.pass).toBe(false);
        if (!result.pass) {
            const body = await result.response.json();
            expect(result.response.status).toBe(503);
            expect(body.errorCode).toBe('SCHEMA_MISSING');
            expect(body.missing).toEqual(['missing_table']);
        }
    });

    it('passes when all required tables exist', async () => {
        mockIsConfigured.mockReturnValue(true);
        const mockFrom = jest.fn().mockReturnValue({
            select: jest.fn().mockReturnValue({
                limit: jest.fn().mockResolvedValue({
                    error: null,
                    count: 0,
                }),
            }),
        });
        mockCreateServer.mockReturnValue({ from: mockFrom } as never);

        const result = await requireSchemaOr503(['trade_ledger', 'broker_trade_fills'], 'Test');

        expect(result.pass).toBe(true);
        expect(mockFrom).toHaveBeenCalledTimes(2);
    });
});
