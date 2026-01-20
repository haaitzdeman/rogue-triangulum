'use client';

/**
 * Live Unlock Modal
 * 
 * Requires user to type "ENABLE LIVE" to unlock live trading.
 * Shows 15-minute countdown.
 */

import React, { useState } from 'react';
import { useTradingMode } from '@/contexts/TradingModeContext';

interface LiveUnlockModalProps {
    onClose: () => void;
    onUnlocked: () => void;
}

export function LiveUnlockModal({ onClose, onUnlocked }: LiveUnlockModalProps) {
    const { unlockLive } = useTradingMode();
    const [confirmText, setConfirmText] = useState('');
    const [error, setError] = useState<string | null>(null);

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();

        const result = unlockLive(confirmText);

        if (result.success) {
            onUnlocked();
        } else {
            setError(result.error || 'Unlock failed');
        }
    };

    return (
        <div className="modal-overlay" onClick={onClose}>
            <div className="modal" onClick={e => e.stopPropagation()}>
                <div className="modal-header">
                    <h2>🔒 Enable Live Trading</h2>
                    <button className="close-btn" onClick={onClose}>×</button>
                </div>

                <div className="modal-body">
                    <div className="warning-box">
                        <p>⚠️ <strong>WARNING:</strong> Live trading uses real money.</p>
                        <p>This will enable live trading for <strong>15 minutes</strong>.</p>
                        <p>All trades will require MHC (Manual Human Check) approval.</p>
                    </div>

                    <form onSubmit={handleSubmit}>
                        <label>
                            Type <code>ENABLE LIVE</code> to confirm:
                        </label>
                        <input
                            type="text"
                            value={confirmText}
                            onChange={(e) => {
                                setConfirmText(e.target.value);
                                setError(null);
                            }}
                            placeholder="Type here..."
                            autoFocus
                        />

                        {error && <p className="error">{error}</p>}

                        <div className="button-row">
                            <button type="button" className="cancel-btn" onClick={onClose}>
                                Cancel
                            </button>
                            <button
                                type="submit"
                                className="unlock-btn"
                                disabled={confirmText !== 'ENABLE LIVE'}
                            >
                                Unlock Live Trading
                            </button>
                        </div>
                    </form>
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
                    max-width: 500px;
                    width: 90%;
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
                
                .warning-box {
                    background: rgba(220, 38, 38, 0.1);
                    border: 1px solid rgba(220, 38, 38, 0.3);
                    border-radius: 8px;
                    padding: 1rem;
                    margin-bottom: 1.5rem;
                }
                
                .warning-box p {
                    margin: 0.5rem 0;
                    color: #f87171;
                }
                
                form {
                    display: flex;
                    flex-direction: column;
                    gap: 1rem;
                }
                
                label {
                    color: #888;
                }
                
                code {
                    background: #333;
                    padding: 0.25rem 0.5rem;
                    border-radius: 4px;
                    color: #fff;
                }
                
                input {
                    padding: 0.75rem;
                    background: #0a0a0a;
                    border: 1px solid #333;
                    border-radius: 8px;
                    color: #fff;
                    font-size: 1rem;
                }
                
                input:focus {
                    outline: none;
                    border-color: #dc2626;
                }
                
                .error {
                    color: #dc2626;
                    margin: 0;
                }
                
                .button-row {
                    display: flex;
                    gap: 1rem;
                    margin-top: 1rem;
                }
                
                .cancel-btn {
                    flex: 1;
                    padding: 0.75rem;
                    background: #333;
                    border: none;
                    border-radius: 8px;
                    color: #fff;
                    cursor: pointer;
                }
                
                .unlock-btn {
                    flex: 1;
                    padding: 0.75rem;
                    background: #dc2626;
                    border: none;
                    border-radius: 8px;
                    color: #fff;
                    cursor: pointer;
                    font-weight: 600;
                }
                
                .unlock-btn:disabled {
                    background: #333;
                    color: #666;
                    cursor: not-allowed;
                }
            `}</style>
        </div>
    );
}
