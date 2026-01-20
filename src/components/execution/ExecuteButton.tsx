'use client';

/**
 * Execute Button
 * 
 * Button to execute a trade with MHC checks.
 * Shows "Execute (Paper)" or "Execute (Live)" based on mode.
 */

import React, { useState } from 'react';
import { useTradingMode } from '@/contexts/TradingModeContext';
import { MHCApprovalModal } from './MHCApprovalModal';
import type { TradeIntent, MHCResult, ExecutionResult } from '@/lib/execution/execution-types';
import { checkMHC, isTradeBlocked } from '@/lib/risk/mhc';

interface ExecuteButtonProps {
    intent: TradeIntent;
    onExecute: (intent: TradeIntent, mhcApproved: boolean) => Promise<ExecutionResult>;
    onResult?: (result: ExecutionResult) => void;
    disabled?: boolean;
    className?: string;
}

export function ExecuteButton({
    intent,
    onExecute,
    onResult,
    disabled,
    className,
}: ExecuteButtonProps) {
    const { mode } = useTradingMode();
    const [loading, setLoading] = useState(false);
    const [showMHC, setShowMHC] = useState(false);
    const [mhcResult, setMhcResult] = useState<MHCResult | null>(null);

    const handleClick = async () => {
        // Check MHC
        const mhc = checkMHC(intent, mode);

        if (mhc.requiresMHC) {
            setMhcResult(mhc);
            setShowMHC(true);
            return;
        }

        // No MHC required - execute directly
        await executeOrder(false);
    };

    const executeOrder = async (mhcApproved: boolean) => {
        setLoading(true);
        try {
            const result = await onExecute(intent, mhcApproved);
            onResult?.(result);
        } catch (error) {
            console.error('[ExecuteButton] Error:', error);
            onResult?.({
                success: false,
                error: String(error),
                mode,
                simulated: mode === 'paper',
            });
        } finally {
            setLoading(false);
        }
    };

    const handleMHCApprove = async () => {
        setShowMHC(false);
        await executeOrder(true);
    };

    const handleMHCReject = () => {
        setShowMHC(false);
        onResult?.({
            success: false,
            error: 'Trade rejected by user',
            errorCode: 'mhc_rejected',
            mode,
            simulated: mode === 'paper',
        });
    };

    const buttonLabel = mode === 'paper' ? '📝 Execute (Paper)' : '🔴 Execute (Live)';
    const _isBlocked = mhcResult ? isTradeBlocked(mhcResult) : false;

    return (
        <>
            <button
                className={`execute-button ${mode} ${className || ''}`}
                onClick={handleClick}
                disabled={disabled || loading}
            >
                {loading ? 'Executing...' : buttonLabel}
            </button>

            {showMHC && mhcResult && (
                <MHCApprovalModal
                    intent={intent}
                    mhcResult={mhcResult}
                    onApprove={handleMHCApprove}
                    onReject={handleMHCReject}
                />
            )}

            <style jsx>{`
                .execute-button {
                    padding: 0.75rem 1.5rem;
                    border: none;
                    border-radius: 8px;
                    font-size: 1rem;
                    font-weight: 600;
                    cursor: pointer;
                    transition: all 0.2s;
                }

                .execute-button.paper {
                    background: linear-gradient(135deg, #3b82f6, #2563eb);
                    color: white;
                }

                .execute-button.paper:hover:not(:disabled) {
                    background: linear-gradient(135deg, #2563eb, #1d4ed8);
                }

                .execute-button.live {
                    background: linear-gradient(135deg, #dc2626, #b91c1c);
                    color: white;
                }

                .execute-button.live:hover:not(:disabled) {
                    background: linear-gradient(135deg, #b91c1c, #991b1b);
                }

                .execute-button:disabled {
                    opacity: 0.5;
                    cursor: not-allowed;
                }
            `}</style>
        </>
    );
}
