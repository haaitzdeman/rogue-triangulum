/**
 * Dev Agent Prompt Meta API Route
 * 
 * GET /api/dev/agent-prompt-meta
 * Returns prompt metadata for verification (NOT the full prompt text).
 * 
 * DISABLED IN PRODUCTION: Returns 404 if NODE_ENV === 'production'
 */

import { NextResponse } from 'next/server';
import { getPromptMetadata } from '@/lib/agent/prompt-builder';

export async function GET() {
    // Production guard
    if (process.env.NODE_ENV === 'production') {
        return NextResponse.json(
            { error: 'Not found' },
            { status: 404 }
        );
    }

    try {
        const metadata = getPromptMetadata();

        return NextResponse.json({
            injected: metadata.injected,
            bundleSha256: metadata.bundleSha256,
            skillsCount: metadata.skillsCount,
            systemPromptLength: metadata.systemPromptLength,
            skillsBlockPresent: metadata.skillsBlockPresent,
        });
    } catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown error';
        return NextResponse.json(
            { error: message },
            { status: 500 }
        );
    }
}
