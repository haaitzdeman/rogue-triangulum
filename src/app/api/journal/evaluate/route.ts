/**
 * POST /api/journal/evaluate
 * 
 * Trigger evaluation of pending signals.
 * Fetches real market data and computes outcomes.
 */

import { NextResponse } from 'next/server';
import { evaluateSignalOutcomes } from '@/lib/journal/signal-evaluator';

interface EvaluateRequest {
    forceReEvaluate?: boolean;
}

export async function POST(request: Request) {
    try {
        const body = await request.json() as EvaluateRequest;

        // Note: forceReEvaluate not implemented yet, only evaluates pending
        console.log('[API] Evaluate request:', { forceReEvaluate: body.forceReEvaluate });

        const result = await evaluateSignalOutcomes();

        return NextResponse.json({
            success: true,
            evaluated: result.evaluated,
            skipped: result.skipped,
            errors: result.errors,
        });
    } catch (error) {
        console.error('[API] Error evaluating signals:', error);
        return NextResponse.json(
            { error: 'Failed to evaluate signals', details: String(error) },
            { status: 500 }
        );
    }
}
