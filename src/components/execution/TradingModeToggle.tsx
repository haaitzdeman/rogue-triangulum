'use client';

/**
 * Trading Mode Toggle
 * 
 * UI toggle for paper/live mode in header or settings.
 * Shows warning when live is unlocked.
 */

import React, { useState } from 'react';
import { useTradingMode, formatUnlockRemaining } from '@/contexts/TradingModeContext';
import { LiveUnlockModal } from './LiveUnlockModal';

export function TradingModeToggle() {
    const { mode, setMode, isLiveUnlocked, liveUnlockRemaining, lockLive } = useTradingMode();
    const [showUnlockModal, setShowUnlockModal] = useState(false);

    const handleModeClick = (newMode: 'paper' | 'live') => {
        if (newMode === 'live' && !isLiveUnlocked) {
            setShowUnlockModal(true);
            return;
        }
        setMode(newMode);
    };

    return (
        <>
            <div className="trading-mode-toggle">
                <div className="toggle-buttons">
                    <button
                        className={`toggle-btn ${mode === 'paper' ? 'active' : ''}`}
                        onClick={() => handleModeClick('paper')}
                    >
                        📝 Paper
                    </button>
                    <button
                        className={`toggle-btn live ${mode === 'live' ? 'active' : ''} ${isLiveUnlocked ? 'unlocked' : ''}`}
                        onClick={() => handleModeClick('live')}
                    >
                        {isLiveUnlocked ? '🔓' : '🔒'} Live
                    </button>
                </div>

                {mode === 'live' && isLiveUnlocked && (
                    <div className="live-warning">
                        <span className="warning-icon">⚠️</span>
                        <span className="timer">{formatUnlockRemaining(liveUnlockRemaining)}</span>
                        <button className="lock-btn" onClick={lockLive}>Lock</button>
                    </div>
                )}
            </div>

            {showUnlockModal && (
                <LiveUnlockModal
                    onClose={() => setShowUnlockModal(false)}
                    onUnlocked={() => {
                        setShowUnlockModal(false);
                        setMode('live');
                    }}
                />
            )}

            <style jsx>{`
                .trading-mode-toggle {
                    display: flex;
                    align-items: center;
                    gap: 1rem;
                }
                
                .toggle-buttons {
                    display: flex;
                    background: rgba(0, 0, 0, 0.2);
                    border-radius: 8px;
                    padding: 4px;
                }
                
                .toggle-btn {
                    padding: 0.5rem 1rem;
                    border: none;
                    background: transparent;
                    color: #888;
                    cursor: pointer;
                    border-radius: 6px;
                    font-weight: 500;
                    transition: all 0.2s;
                }
                
                .toggle-btn:hover {
                    color: #fff;
                }
                
                .toggle-btn.active {
                    background: #333;
                    color: #fff;
                }
                
                .toggle-btn.live.active {
                    background: #dc2626;
                    color: #fff;
                }
                
                .toggle-btn.live.unlocked {
                    border: 1px solid #dc2626;
                }
                
                .live-warning {
                    display: flex;
                    align-items: center;
                    gap: 0.5rem;
                    padding: 0.25rem 0.5rem;
                    background: rgba(220, 38, 38, 0.1);
                    border: 1px solid rgba(220, 38, 38, 0.3);
                    border-radius: 6px;
                    font-size: 0.875rem;
                }
                
                .warning-icon {
                    animation: pulse 2s infinite;
                }
                
                .timer {
                    font-family: monospace;
                    color: #dc2626;
                }
                
                .lock-btn {
                    padding: 0.25rem 0.5rem;
                    border: none;
                    background: #dc2626;
                    color: white;
                    border-radius: 4px;
                    cursor: pointer;
                    font-size: 0.75rem;
                }
                
                @keyframes pulse {
                    0%, 100% { opacity: 1; }
                    50% { opacity: 0.5; }
                }
            `}</style>
        </>
    );
}
