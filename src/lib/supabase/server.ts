/**
 * Server-side Supabase Client
 *
 * Uses SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY for privileged server-side reads.
 * NEVER use NEXT_PUBLIC_* keys here — those are for browser-side only.
 *
 * This client bypasses RLS and should only be used in API routes / server-side code.
 */

import { createClient, type SupabaseClient } from '@supabase/supabase-js';

let _serverClient: SupabaseClient | null = null;

/**
 * Returns true if server-side Supabase credentials are configured.
 */
export function isServerSupabaseConfigured(): boolean {
    return Boolean(
        process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY,
    );
}

/**
 * Create (or reuse) a server-side Supabase client.
 * Throws if credentials are missing — callers must handle this.
 */
export function createServerSupabase(): SupabaseClient {
    if (_serverClient) return _serverClient;

    const url = process.env.SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!url || !key) {
        throw new Error(
            'Server Supabase not configured: SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required.',
        );
    }

    _serverClient = createClient(url, key, {
        auth: { persistSession: false, autoRefreshToken: false },
    });

    return _serverClient;
}
