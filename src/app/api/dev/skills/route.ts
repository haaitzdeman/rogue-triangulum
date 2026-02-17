/**
 * Dev Skills API Route
 * 
 * GET /api/dev/skills
 * Returns skills metadata (not full bundle text) for verification.
 * 
 * DISABLED IN PRODUCTION: Returns 404 if NODE_ENV === 'production'
 */

import { NextResponse } from 'next/server';
import { getSkillsMetadata } from '@/lib/agent/skills-loader';

export async function GET() {
    // Production guard
    if (process.env.NODE_ENV === 'production') {
        return NextResponse.json(
            { error: 'Not found' },
            { status: 404 }
        );
    }

    try {
        const metadata = getSkillsMetadata();

        return NextResponse.json({
            skillCount: metadata.skillCount,
            skills: metadata.skills,
            bundleSha256: metadata.bundleSha256,
        });
    } catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown error';
        return NextResponse.json(
            { error: message },
            { status: 500 }
        );
    }
}
