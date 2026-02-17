/**
 * GET /api/executions
 * POST /api/executions
 * 
 * API route for paper executions.
 * GET: List all paper executions (from file store)
 * POST: Execute a trade via TradeGate
 * 
 * SAFETY: If requestedMode=live but server mode is paper, return 403 live_locked
 * Response shape: { success: boolean, result: {...} }
 */

import { NextResponse } from 'next/server';
import { getExecutions } from '@/lib/execution/paper-store';
import { getTradeGate, getTradingMode, createTradeIntent } from '@/lib/execution/trade-gate';
import type { TradingMode } from '@/lib/execution/execution-types';

export async function GET() {
    try {
        const executions = getExecutions();
        const mode = getTradingMode();

        return NextResponse.json({
            success: true,
            result: {
                mode,
                executions,
                count: executions.length,
            },
        });
    } catch (error) {
        console.error('[API] Error getting executions:', error);
        return NextResponse.json(
            {
                success: false,
                result: {
                    error: 'Failed to get executions',
                    details: String(error)
                }
            },
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
                {
                    success: false,
                    result: {
                        error: 'Missing required fields: symbol, side, quantity'
                    }
                },
                { status: 400 }
            );
        }

        // Parse requested mode (default: paper)
        const requestedMode: TradingMode = body.mode === 'live' ? 'live' : 'paper';

        // Get server's effective mode
        const effectiveMode = getTradingMode();

        // SAFETY: If client requests LIVE but server is locked to PAPER, reject immediately
        // Do NOT call tradeGate.execute() in this case
        if (requestedMode === 'live' && effectiveMode !== 'live') {
            console.warn(`[API] LIVE trade rejected: server mode is ${effectiveMode}`);
            return NextResponse.json({
                success: false,
                result: {
                    mode: effectiveMode,
                    requestedMode,
                    errorCode: 'live_locked',
                    error: 'LIVE mode is locked. Unlock required.',
                    simulated: true,
                },
            }, { status: 403 });
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

        // Execute via TradeGate (always pass requestedMode)
        const tradeGate = getTradeGate();
        const mhcApproved = body.mhcApproved || false;
        const executionResult = await tradeGate.execute(intent, mhcApproved, requestedMode);

        console.log(`[API] Trade executed: ${executionResult.success ? 'SUCCESS' : 'FAILED'} - ${executionResult.orderId || executionResult.error}`);

        return NextResponse.json({
            success: executionResult.success,
            result: executionResult,
        });
    } catch (error) {
        console.error('[API] Execution error:', error);
        return NextResponse.json(
            {
                success: false,
                result: {
                    error: 'Failed to execute trade',
                    details: String(error)
                }
            },
            { status: 500 }
        );
    }
}
