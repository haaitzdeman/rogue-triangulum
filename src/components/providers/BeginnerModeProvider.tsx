"use client";

import { createContext, useContext, useState, useCallback, ReactNode } from "react";

interface BeginnerModeContextType {
    beginnerMode: boolean;
    toggleBeginnerMode: () => void;
    setBeginnerMode: (value: boolean) => void;
}

const BeginnerModeContext = createContext<BeginnerModeContextType | undefined>(undefined);

export function BeginnerModeProvider({ children }: { children: ReactNode }) {
    const [beginnerMode, setBeginnerModeState] = useState(true); // Default to beginner-friendly

    const toggleBeginnerMode = useCallback(() => {
        setBeginnerModeState(prev => !prev);
    }, []);

    const setBeginnerMode = useCallback((value: boolean) => {
        setBeginnerModeState(value);
    }, []);

    return (
        <BeginnerModeContext.Provider value={{ beginnerMode, toggleBeginnerMode, setBeginnerMode }}>
            {children}
        </BeginnerModeContext.Provider>
    );
}

export function useBeginnerMode(): BeginnerModeContextType {
    const context = useContext(BeginnerModeContext);
    if (context === undefined) {
        throw new Error("useBeginnerMode must be used within a BeginnerModeProvider");
    }
    return context;
}
