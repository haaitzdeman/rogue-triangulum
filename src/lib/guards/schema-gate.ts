/**
 * Schema Gate — Deploy Safety
 *
 * Shared helper that checks whether required DB tables exist before
 * allowing a route to proceed. Returns 503 with clear error if missing.
 *
 * Usage:
 *   const gate = await requireSchemaOr503(['broker_trade_fills', 'trade_ledger'], 'BrokerSync');
 *   if (!gate.pass) return gate.response;
 */

import { NextResponse } from 'next/server';
import { isServerSupabaseConfigured, createServerSupabase } from '@/lib/supabase/server';

export async function requireSchemaOr503(
    requiredTables: string[],
    context: string,
): Promise<{ pass: true } | { pass: false; response: NextResponse }> {
    // Gate 1: server DB must be configured
    if (!isServerSupabaseConfigured()) {
        return {
            pass: false,
            response: NextResponse.json(
                {
                    success: false,
                    errorCode: 'DB_NOT_CONFIGURED',
                    message: `${context}: SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required.`,
                    missing: requiredTables,
                },
                { status: 503 },
            ),
        };
    }

    // Gate 2: required tables must exist
    try {
        const db = createServerSupabase();
        const missing: string[] = [];

        for (const table of requiredTables) {
            const { error } = await db
                .from(table)
                .select('*', { count: 'exact', head: true })
                .limit(0);

            // PGRST204 = unknown table, 42P01 = relation does not exist
            if (error && (error.code === '42P01' || error.message?.includes('does not exist'))) {
                missing.push(table);
            }
        }

        if (missing.length > 0) {
            return {
                pass: false,
                response: NextResponse.json(
                    {
                        success: false,
                        errorCode: 'SCHEMA_MISSING',
                        message: `${context}: Required tables missing. Run migrations first.`,
                        missing,
                    },
                    { status: 503 },
                ),
            };
        }
    } catch (err) {
        return {
            pass: false,
            response: NextResponse.json(
                {
                    success: false,
                    errorCode: 'SCHEMA_CHECK_FAILED',
                    message: `${context}: Schema check failed — ${err instanceof Error ? err.message : 'Unknown error'}`,
                    missing: requiredTables,
                },
                { status: 503 },
            ),
        };
    }

    return { pass: true };
}
