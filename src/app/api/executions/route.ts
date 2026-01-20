/**
 * GET /api/executions
 * POST /api/executions
 * 
 * API route for paper executions.
 * GET: List all paper executions (from file store)
 * POST: Execute a trade via TradeGate
 */

import { NextResponse } from 'next/server';
import { getExecutions } from '@/lib/execution/paper-store';
import { getTradeGate, getTradingMode, createTradeIntent } from '@/lib/execution/trade-gate';

export async function GET() {
    try {
        const executions = getExecutions();
        const mode = getTradingMode();

        return NextResponse.json({
            success: true,
            mode,
            executions,
            count: executions.length,
        });
    } catch (error) {
        console.error('[API] Error getting executions:', error);
        return NextResponse.json(
            { error: 'Failed to get executions', details: String(error) },
            { status: 500 }
        );
    }
}

export async function POST(request: Request) {
    try {
        const body = await request.json();

        // Validate required fields
        if (!body.symbol || !body.side || !body.quantity) {
            return NextResponse.json(
                { error: 'Missing required fields: symbol, side, quantity' },
                { status: 400 }
            );
        }

        // Create trade intent
        const intent = createTradeIntent(
            body.symbol,
            body.side,
            body.quantity,
            {
                desk: body.desk || 'swing',
                strategyName: body.strategyName || 'Manual',
                signalId: body.signalId,
                score: body.score || 50,
                confidence: body.confidence || 0.5,
                reasons: body.reasons || ['Manual trade'],
            },
            {
                limitPrice: body.limitPrice,
                stopLoss: body.stopLoss,
                takeProfit: body.takeProfit,
            }
        );

        // Execute via TradeGate
        const tradeGate = getTradeGate();
        const result = await tradeGate.execute(intent, body.mhcApproved || false);

        console.log(`[API] Trade executed: ${result.success ? 'SUCCESS' : 'FAILED'} - ${result.orderId || result.error}`);

        return NextResponse.json({
            success: result.success,
            result,
        });
    } catch (error) {
        console.error('[API] Execution error:', error);
        return NextResponse.json(
            { error: 'Failed to execute trade', details: String(error) },
            { status: 500 }
        );
    }
}
