export const dynamic = 'force-dynamic';

/**
 * POST /api/journal/debug/seed-drift
 * PERMANENTLY DISABLED — always returns 404.
 * No imports, no side effects, no fs, no signal-store.
 */

import { NextResponse } from 'next/server';

export async function POST() {
    return new NextResponse(null, { status: 404 });
}
