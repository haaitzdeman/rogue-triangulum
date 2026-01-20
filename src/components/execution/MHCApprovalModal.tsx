'use client';

/**
 * MHC Approval Modal
 * 
 * Shows trade intent summary and MHC trigger reasons.
 * User must click "Approve" to proceed with execution.
 */

import React from 'react';
import type { TradeIntent, MHCResult } from '@/lib/execution/execution-types';

interface MHCApprovalModalProps {
    intent: TradeIntent;
    mhcResult: MHCResult;
    onApprove: () => void;
    onReject: () => void;
}

export function MHCApprovalModal({ intent, mhcResult, onApprove, onReject }: MHCApprovalModalProps) {
    const isBlocked = mhcResult.blockedReasons && mhcResult.blockedReasons.length > 0;

    return (
        <div className="modal-overlay" onClick={onReject}>
            <div className="modal" onClick={e => e.stopPropagation()}>
                <div className="modal-header">
                    <h2>⚠️ Manual Human Check Required</h2>
                    <button className="close-btn" onClick={onReject}>×</button>
                </div>

                <div className="modal-body">
                    {/* Trade Summary */}
                    <div className="trade-summary">
                        <h3>Trade Intent</h3>
                        <div className="summary-grid">
                            <div className="row">
                                <span className="label">Symbol</span>
                                <span className="value">{intent.symbol}</span>
                            </div>
                            <div className="row">
                                <span className="label">Direction</span>
                                <span className={`value ${intent.side === 'buy' ? 'long' : 'short'}`}>
                                    {intent.side.toUpperCase()}
                                </span>
                            </div>
                            <div className="row">
                                <span className="label">Quantity</span>
                                <span className="value">{intent.quantity}</span>
                            </div>
                            <div className="row">
                                <span className="label">Position Value</span>
                                <span className="value">${intent.positionValue.toFixed(2)}</span>
                            </div>
                            <div className="row">
                                <span className="label">Strategy</span>
                                <span className="value">{intent.source.strategyName}</span>
                            </div>
                            <div className="row">
                                <span className="label">Score / Confidence</span>
                                <span className="value">
                                    {intent.source.score} / {(intent.source.confidence * 100).toFixed(0)}%
                                </span>
                            </div>
                        </div>
                    </div>

                    {/* MHC Reasons */}
                    <div className="mhc-reasons">
                        <h3>MHC Trigger Reasons</h3>

                        {isBlocked && (
                            <div className="blocked-reasons">
                                <p>⛔ <strong>BLOCKED - Cannot proceed:</strong></p>
                                <ul>
                                    {mhcResult.blockedReasons!.map((reason, i) => (
                                        <li key={i}>{reason}</li>
                                    ))}
                                </ul>
                            </div>
                        )}

                        {mhcResult.reasons.length > 0 && (
                            <div className="warning-reasons">
                                <p>⚠️ <strong>Requires approval:</strong></p>
                                <ul>
                                    {mhcResult.reasons.map((reason, i) => (
                                        <li key={i}>{reason}</li>
                                    ))}
                                </ul>
                            </div>
                        )}
                    </div>

                    {/* Action Buttons */}
                    <div className="button-row">
                        <button className="reject-btn" onClick={onReject}>
                            Reject
                        </button>
                        <button
                            className="approve-btn"
                            onClick={onApprove}
                            disabled={isBlocked}
                        >
                            {isBlocked ? 'Blocked' : 'Approve Trade'}
                        </button>
                    </div>
                </div>
            </div>

            <style jsx>{`
                .modal-overlay {
                    position: fixed;
                    inset: 0;
                    background: rgba(0, 0, 0, 0.8);
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    z-index: 1000;
                }

                .modal {
                    background: #1a1a1a;
                    border: 1px solid #333;
                    border-radius: 12px;
                    max-width: 600px;
                    width: 90%;
                    max-height: 90vh;
                    overflow-y: auto;
                }

                .modal-header {
                    display: flex;
                    justify-content: space-between;
                    align-items: center;
                    padding: 1rem 1.5rem;
                    border-bottom: 1px solid #333;
                }

                .modal-header h2 {
                    margin: 0;
                    font-size: 1.25rem;
                    color: #f59e0b;
                }

                .close-btn {
                    background: none;
                    border: none;
                    color: #888;
                    font-size: 1.5rem;
                    cursor: pointer;
                }

                .modal-body {
                    padding: 1.5rem;
                }

                .trade-summary {
                    background: #0a0a0a;
                    border: 1px solid #333;
                    border-radius: 8px;
                    padding: 1rem;
                    margin-bottom: 1.5rem;
                }

                .trade-summary h3 {
                    margin: 0 0 1rem 0;
                    font-size: 1rem;
                    color: #888;
                }

                .summary-grid {
                    display: flex;
                    flex-direction: column;
                    gap: 0.5rem;
                }

                .row {
                    display: flex;
                    justify-content: space-between;
                }

                .label {
                    color: #666;
                }

                .value {
                    font-weight: 500;
                }

                .value.long {
                    color: #22c55e;
                }

                .value.short {
                    color: #ef4444;
                }

                .mhc-reasons {
                    margin-bottom: 1.5rem;
                }

                .mhc-reasons h3 {
                    margin: 0 0 1rem 0;
                    font-size: 1rem;
                    color: #888;
                }

                .blocked-reasons, .warning-reasons {
                    padding: 1rem;
                    border-radius: 8px;
                    margin-bottom: 1rem;
                }

                .blocked-reasons {
                    background: rgba(220, 38, 38, 0.1);
                    border: 1px solid rgba(220, 38, 38, 0.3);
                }

                .blocked-reasons p {
                    color: #f87171;
                    margin: 0 0 0.5rem 0;
                }

                .warning-reasons {
                    background: rgba(245, 158, 11, 0.1);
                    border: 1px solid rgba(245, 158, 11, 0.3);
                }

                .warning-reasons p {
                    color: #fbbf24;
                    margin: 0 0 0.5rem 0;
                }

                ul {
                    margin: 0;
                    padding-left: 1.5rem;
                    color: #999;
                }

                li {
                    margin: 0.25rem 0;
                }

                .button-row {
                    display: flex;
                    gap: 1rem;
                }

                .reject-btn {
                    flex: 1;
                    padding: 0.75rem;
                    background: #333;
                    border: none;
                    border-radius: 8px;
                    color: #fff;
                    cursor: pointer;
                    font-size: 1rem;
                }

                .approve-btn {
                    flex: 1;
                    padding: 0.75rem;
                    background: #22c55e;
                    border: none;
                    border-radius: 8px;
                    color: #fff;
                    cursor: pointer;
                    font-size: 1rem;
                    font-weight: 600;
                }

                .approve-btn:disabled {
                    background: #333;
                    color: #666;
                    cursor: not-allowed;
                }
            `}</style>
        </div>
    );
}
