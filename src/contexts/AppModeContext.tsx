'use client';

import { createContext, useContext, useState, useEffect, ReactNode } from 'react';

type AppMode = 'test' | 'live';

interface AppModeContextType {
    mode: AppMode;
    setMode: (mode: AppMode) => void;
    isLive: boolean;
    isTest: boolean;
}

const AppModeContext = createContext<AppModeContextType | undefined>(undefined);

const STORAGE_KEY = 'rogue-triangulum-app-mode';

export function AppModeProvider({ children }: { children: ReactNode }) {
    const [mode, setModeState] = useState<AppMode>('test'); // Default to test mode for safety

    // Load from localStorage on mount
    useEffect(() => {
        const saved = localStorage.getItem(STORAGE_KEY);
        if (saved === 'live' || saved === 'test') {
            setModeState(saved);
        }
    }, []);

    // Persist to localStorage on change
    const setMode = (newMode: AppMode) => {
        setModeState(newMode);
        localStorage.setItem(STORAGE_KEY, newMode);

        // Log mode change for debugging
        console.log(`🔄 App mode changed to: ${newMode.toUpperCase()}`);
    };

    const value: AppModeContextType = {
        mode,
        setMode,
        isLive: mode === 'live',
        isTest: mode === 'test',
    };

    return (
        <AppModeContext.Provider value={value}>
            {children}
        </AppModeContext.Provider>
    );
}

export function useAppMode(): AppModeContextType {
    const context = useContext(AppModeContext);
    if (!context) {
        throw new Error('useAppMode must be used within AppModeProvider');
    }
    return context;
}

// Convenience hook for components that just need to check mode
export function useIsLiveMode(): boolean {
    const { isLive } = useAppMode();
    return isLive;
}
