export const dynamic = 'force-dynamic';

/**
 * Clear Override — Admin Route
 *
 * PATCH /api/premarket/journal/[id]/clear-override
 *
 * Clears manual_override, entry_fill_id, exit_fill_id so the entry
 * can be auto-reconciled again on next broker sync.
 *
 * Requires: ADMIN_TOKEN header or ADMIN_MODE=true env.
 */

import { NextRequest, NextResponse } from 'next/server';
import { checkAdminAuth } from '@/lib/auth/admin-gate';
import { isSupabaseConfigured } from '@/lib/supabase/client';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL || '',
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || ''
);

export async function PATCH(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
    // Admin gate
    const auth = checkAdminAuth(request);
    if (!auth.authorized) {
        return NextResponse.json(
            { success: false, error: auth.reason || 'Unauthorized' },
            { status: 401 },
        );
    }

    if (!isSupabaseConfigured()) {
        return NextResponse.json(
            { success: false, error: 'Supabase not configured' },
            { status: 503 },
        );
    }

    try {
        const { id } = await params;

        const updates = {
            manual_override: false,
            entry_fill_id: null,
            exit_fill_id: null,
            reconcile_status: null,
            match_explanation: null,
            system_update_reason: `admin-clear-override:${new Date().toISOString()}`,
        };

        const { data, error } = await supabase
            .from('premarket_journal_entries')
            .update(updates)
            .eq('id', id)
            .select()
            .single();

        if (error) {
            return NextResponse.json(
                { success: false, error: error.message },
                { status: 500 },
            );
        }

        if (!data) {
            return NextResponse.json(
                { success: false, error: `Entry ${id} not found` },
                { status: 404 },
            );
        }

        return NextResponse.json({
            success: true,
            entry: data,
            action: 'clear-override',
        });
    } catch (err) {
        console.error('[ClearOverride] error:', err);
        return NextResponse.json(
            { success: false, error: 'Internal error' },
            { status: 500 },
        );
    }
}
