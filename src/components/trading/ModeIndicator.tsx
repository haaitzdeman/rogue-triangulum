'use client';

/**
 * Mode Indicator Component
 * 
 * Shows PAPER or LIVE mode status with visual distinction.
 */

import { useTrading } from '@/hooks/useTradingContext';

export function ModeIndicator() {
    const { mode, canEnableLive, setMode, killSwitchActive, tradesToday, dailyPnL } = useTrading();

    const isPaper = mode === 'PAPER';

    return (
        <div className={`
      flex items-center gap-3 px-4 py-2 rounded-lg border
      ${isPaper
                ? 'bg-blue-900/30 border-blue-500/50 text-blue-400'
                : 'bg-red-900/30 border-red-500/50 text-red-400'}
    `}>
            {/* Mode badge */}
            <div className={`
        px-3 py-1 rounded font-bold text-sm
        ${isPaper ? 'bg-blue-500 text-black' : 'bg-red-500 text-white'}
      `}>
                {mode}
            </div>

            {/* Status */}
            <div className="text-sm">
                {killSwitchActive ? (
                    <span className="text-red-500 font-bold animate-pulse">
                        ⚠️ KILL SWITCH ACTIVE
                    </span>
                ) : (
                    <span>
                        Trades: {tradesToday} | P&L: ${dailyPnL.toFixed(0)}
                    </span>
                )}
            </div>

            {/* Mode toggle */}
            <div className="ml-auto flex items-center gap-2">
                <button
                    onClick={() => setMode('PAPER')}
                    disabled={isPaper}
                    className={`px-3 py-1 rounded text-sm ${isPaper
                            ? 'bg-blue-500 text-black'
                            : 'bg-gray-700 text-gray-400 hover:bg-gray-600'
                        }`}
                >
                    PAPER
                </button>
                <button
                    onClick={() => setMode('LIVE')}
                    disabled={!canEnableLive || !isPaper}
                    title={!canEnableLive ? 'Complete readiness gates to enable LIVE trading' : ''}
                    className={`px-3 py-1 rounded text-sm ${!isPaper
                            ? 'bg-red-500 text-white'
                            : canEnableLive
                                ? 'bg-gray-700 text-gray-400 hover:bg-red-600 hover:text-white'
                                : 'bg-gray-800 text-gray-600 cursor-not-allowed'
                        }`}
                >
                    LIVE {!canEnableLive && '🔒'}
                </button>
            </div>
        </div>
    );
}
