'use client';

/**
 * Trading Mode Context
 * 
 * App-wide state for paper/live trading mode.
 * Default is PAPER. LIVE requires explicit unlock.
 */

import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';

export type TradingMode = 'paper' | 'live';

interface TradingModeContextValue {
    mode: TradingMode;
    setMode: (mode: TradingMode) => { success: boolean; error?: string };

    // Live unlock
    liveUnlockedUntil: number | null;
    isLiveUnlocked: boolean;
    liveUnlockRemaining: number;
    unlockLive: (confirmText: string) => { success: boolean; error?: string };
    lockLive: () => void;
}

const LIVE_UNLOCK_DURATION_MS = 15 * 60 * 1000; // 15 minutes

const TradingModeContext = createContext<TradingModeContextValue | null>(null);

export function TradingModeProvider({ children }: { children: React.ReactNode }) {
    const [mode, setModeState] = useState<TradingMode>('paper');
    const [liveUnlockedUntil, setLiveUnlockedUntil] = useState<number | null>(null);
    const [liveUnlockRemaining, setLiveUnlockRemaining] = useState(0);

    // Check if live is unlocked
    const isLiveUnlocked = useCallback(() => {
        if (liveUnlockedUntil === null) return false;
        return Date.now() < liveUnlockedUntil;
    }, [liveUnlockedUntil]);

    // Auto-revert to paper when unlock expires
    useEffect(() => {
        if (liveUnlockedUntil === null) return;

        const interval = setInterval(() => {
            const remaining = liveUnlockedUntil - Date.now();
            setLiveUnlockRemaining(Math.max(0, remaining));

            if (remaining <= 0) {
                console.log('[TradingMode] Live unlock expired - reverting to paper');
                setModeState('paper');
                setLiveUnlockedUntil(null);
            }
        }, 1000);

        return () => clearInterval(interval);
    }, [liveUnlockedUntil]);

    // Set mode
    const setMode = useCallback((newMode: TradingMode): { success: boolean; error?: string } => {
        if (newMode === 'live' && !isLiveUnlocked()) {
            return { success: false, error: 'Live trading is locked. Unlock first.' };
        }
        setModeState(newMode);
        console.log(`[TradingMode] Mode set to: ${newMode}`);
        return { success: true };
    }, [isLiveUnlocked]);

    // Unlock live
    const unlockLive = useCallback((confirmText: string): { success: boolean; error?: string } => {
        if (confirmText !== 'ENABLE LIVE') {
            return { success: false, error: 'Must type "ENABLE LIVE" exactly' };
        }

        const unlockUntil = Date.now() + LIVE_UNLOCK_DURATION_MS;
        setLiveUnlockedUntil(unlockUntil);
        setLiveUnlockRemaining(LIVE_UNLOCK_DURATION_MS);
        console.log('[TradingMode] Live trading unlocked for 15 minutes');
        return { success: true };
    }, []);

    // Lock live
    const lockLive = useCallback(() => {
        setLiveUnlockedUntil(null);
        setLiveUnlockRemaining(0);
        setModeState('paper');
        console.log('[TradingMode] Live trading locked');
    }, []);

    const value: TradingModeContextValue = {
        mode,
        setMode,
        liveUnlockedUntil,
        isLiveUnlocked: isLiveUnlocked(),
        liveUnlockRemaining,
        unlockLive,
        lockLive,
    };

    return (
        <TradingModeContext.Provider value={value}>
            {children}
        </TradingModeContext.Provider>
    );
}

export function useTradingMode(): TradingModeContextValue {
    const context = useContext(TradingModeContext);
    if (!context) {
        throw new Error('useTradingMode must be used within TradingModeProvider');
    }
    return context;
}

/**
 * Format remaining unlock time
 */
export function formatUnlockRemaining(ms: number): string {
    if (ms <= 0) return '0:00';
    const minutes = Math.floor(ms / 60000);
    const seconds = Math.floor((ms % 60000) / 1000);
    return `${minutes}:${seconds.toString().padStart(2, '0')}`;
}
