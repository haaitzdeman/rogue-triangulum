export const dynamic = 'force-dynamic';

/**
 * Dev Agent Environment API Route
 * 
 * GET /api/dev/agent-env
 * Returns environment variable presence (not values) for debugging.
 * 
 * DISABLED IN PRODUCTION: Returns 404 if NODE_ENV === 'production'
 */

import { NextResponse } from 'next/server';
import { getEffectiveXaiModel, getEffectiveXaiBaseUrl } from '@/lib/agent/agent-runner';

export async function GET() {
    // Production guard
    if (process.env.NODE_ENV === 'production') {
        return NextResponse.json(
            { error: 'Not found' },
            { status: 404 }
        );
    }

    const xaiModelInfo = getEffectiveXaiModel();

    return NextResponse.json({
        nodeEnv: process.env.NODE_ENV ?? null,
        hasGEMINI_API_KEY: !!process.env.GEMINI_API_KEY,
        hasOPENAI_API_KEY: !!process.env.OPENAI_API_KEY,
        hasXAI_API_KEY: !!process.env.XAI_API_KEY,
        hasANTHROPIC_API_KEY: !!process.env.ANTHROPIC_API_KEY,
        xaiModel: process.env.XAI_MODEL ?? null,
        openaiModel: process.env.OPENAI_MODEL ?? null,
        geminiModel: process.env.GEMINI_MODEL ?? null,
        // xAI config per spec
        effectiveXaiBaseUrl: getEffectiveXaiBaseUrl(),
        effectiveXaiModel: xaiModelInfo.model,
        xaiModelSource: xaiModelInfo.fromEnv ? 'env' : 'default',
    });
}
