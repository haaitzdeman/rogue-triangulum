/**
 * Dev Agent Run API Route
 * 
 * POST /api/agent/run
 * Runs the agent with a user message. DEV ONLY.
 * 
 * Request: { message: string, model?: string, provider?: 'openai' | 'anthropic' | 'gemini' }
 * Response: { success: boolean, text?: string, errorCode?: string, error?: string, metadata?: {...} }
 * 
 * Provider selection:
 * 1. If request body includes provider, use it
 * 2. Else if GEMINI_API_KEY exists, default to gemini
 * 3. Else default to openai
 * 
 * DISABLED IN PRODUCTION: Returns 404 if NODE_ENV === 'production'
 */

import { NextRequest, NextResponse } from 'next/server';
import { runAgent, getDefaultProvider, type LLMProvider } from '@/lib/agent/agent-runner';

export async function POST(request: NextRequest) {
    // Production guard
    if (process.env.NODE_ENV === 'production') {
        return NextResponse.json(
            { error: 'Not found' },
            { status: 404 }
        );
    }

    try {
        const body = await request.json();
        const { message, model, provider: requestedProvider } = body as {
            message?: string;
            model?: string;
            provider?: LLMProvider;
        };

        if (!message || typeof message !== 'string') {
            return NextResponse.json(
                { success: false, errorCode: 'INVALID_REQUEST', error: 'message is required' },
                { status: 400 }
            );
        }

        // Determine provider: use requested, or auto-detect from available keys
        const provider: LLMProvider = requestedProvider || getDefaultProvider();

        const result = await runAgent(message, { model, provider });

        // Return result WITH metadata for error diagnostics
        // Metadata is safe to expose (no secrets)
        return NextResponse.json({
            success: result.success,
            text: result.text,
            errorCode: result.errorCode,
            error: result.error,
            metadata: result.metadata,
        });
    } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        return NextResponse.json(
            { success: false, errorCode: 'INTERNAL_ERROR', error: errorMessage },
            { status: 500 }
        );
    }
}
