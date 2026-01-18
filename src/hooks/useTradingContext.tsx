'use client';

/**
 * Trading Context Provider
 * 
 * Provides orchestrator, trade gate, and mode state to the app.
 */

import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { getOrchestrator, type DeskType, type ExecutionMode, type MarketContext, type RankedCandidate } from '@/lib/core';
import { getTradeGate } from '@/lib/execution';
import { DayTradingBrain, OptionsBrain, SwingBrain, InvestingBrain } from '@/lib/brains';

// Context type
interface TradingContextType {
    // Mode
    mode: ExecutionMode;
    setMode: (mode: ExecutionMode) => void;
    canEnableLive: boolean;

    // Desk
    activeDesk: DeskType;
    setActiveDesk: (desk: DeskType) => void;

    // Candidates
    candidates: RankedCandidate[];
    loading: boolean;
    refreshCandidates: () => Promise<void>;

    // Trade gate status
    killSwitchActive: boolean;
    tradesToday: number;
    dailyPnL: number;
}

const TradingContext = createContext<TradingContextType | null>(null);

// Default market context
function getDefaultMarketContext(): MarketContext {
    const now = new Date();
    const hour = now.getHours();
    const marketOpen = hour >= 9 && hour < 16; // Simplified

    return {
        timestamp: Date.now(),
        marketOpen,
        preMarket: hour >= 4 && hour < 9,
        afterHours: hour >= 16 && hour < 20,
        vix: 18 + Math.random() * 10,
        marketRegime: 'neutral',
    };
}

export function TradingProvider({ children }: { children: React.ReactNode }) {
    const [mode, setModeState] = useState<ExecutionMode>('PAPER');
    const [activeDesk, setActiveDeskState] = useState<DeskType>('day-trading');
    const [candidates, setCandidates] = useState<RankedCandidate[]>([]);
    const [loading, setLoading] = useState(false);
    const [killSwitchActive, setKillSwitchActive] = useState(false);
    const [tradesToday, setTradesToday] = useState(0);
    const [dailyPnL, setDailyPnL] = useState(0);
    const [initialized, setInitialized] = useState(false);

    // Initialize brains
    useEffect(() => {
        if (initialized) return;

        const orchestrator = getOrchestrator();
        orchestrator.registerBrain(new DayTradingBrain());
        orchestrator.registerBrain(new OptionsBrain());
        orchestrator.registerBrain(new SwingBrain());
        orchestrator.registerBrain(new InvestingBrain());

        setInitialized(true);
    }, [initialized]);

    // Set mode
    const setMode = useCallback(async (newMode: ExecutionMode) => {
        const tradeGate = getTradeGate();
        const success = await tradeGate.setMode(newMode);
        if (success) {
            setModeState(newMode);
        }
    }, []);

    // Set active desk
    const setActiveDesk = useCallback((desk: DeskType) => {
        const orchestrator = getOrchestrator();
        orchestrator.setActiveDesk(desk);
        setActiveDeskState(desk);
    }, []);

    // Refresh candidates
    const refreshCandidates = useCallback(async () => {
        setLoading(true);
        try {
            const orchestrator = getOrchestrator();
            const context = getDefaultMarketContext();
            const newCandidates = await orchestrator.requestCandidates(context);
            setCandidates(newCandidates);
        } catch (error) {
            console.error('Failed to fetch candidates:', error);
        } finally {
            setLoading(false);
        }
    }, []);

    // Update trade gate status
    useEffect(() => {
        const updateStatus = async () => {
            const tradeGate = getTradeGate();
            setKillSwitchActive(tradeGate.guardrails.killSwitchActive);
            setTradesToday(await tradeGate.getTradesToday());
            setDailyPnL(await tradeGate.getDailyPnL());
        };

        updateStatus();
        const interval = setInterval(updateStatus, 10000);
        return () => clearInterval(interval);
    }, []);

    // Initial fetch
    useEffect(() => {
        if (initialized) {
            refreshCandidates();
        }
    }, [initialized, activeDesk, refreshCandidates]);

    return (
        <TradingContext.Provider
            value={{
                mode,
                setMode,
                canEnableLive: false, // Will be true when readiness gates pass
                activeDesk,
                setActiveDesk,
                candidates,
                loading,
                refreshCandidates,
                killSwitchActive,
                tradesToday,
                dailyPnL,
            }}
        >
            {children}
        </TradingContext.Provider>
    );
}

export function useTrading() {
    const context = useContext(TradingContext);
    if (!context) {
        throw new Error('useTrading must be used within TradingProvider');
    }
    return context;
}
