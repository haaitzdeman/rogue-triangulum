/**
 * Override Fills — Admin Route
 *
 * PATCH /api/premarket/journal/[id]/override-fills
 *
 * Allows admin to manually set entry_fill_id and exit_fill_id on a journal entry.
 * Sets manual_override=true to prevent auto-reconciliation from overwriting.
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

interface OverridePayload {
    entry_fill_id: string;
    exit_fill_id: string;
}

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
        const body = await request.json() as OverridePayload;

        if (!body.entry_fill_id || !body.exit_fill_id) {
            return NextResponse.json(
                { success: false, error: 'entry_fill_id and exit_fill_id are required' },
                { status: 400 },
            );
        }

        const updates = {
            manual_override: true,
            entry_fill_id: body.entry_fill_id,
            exit_fill_id: body.exit_fill_id,
            reconcile_status: 'MATCHED',
            system_update_reason: `admin-override:${new Date().toISOString()}`,
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
            action: 'override-fills',
        });
    } catch (err) {
        console.error('[OverrideFills] error:', err);
        return NextResponse.json(
            { success: false, error: 'Internal error' },
            { status: 500 },
        );
    }
}
