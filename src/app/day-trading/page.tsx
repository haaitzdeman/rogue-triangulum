"use client";

import { useState } from "react";
import { ChartBarIcon, ArrowPathIcon } from "@heroicons/react/24/outline";
import { DeskHeader } from "@/components/desk/DeskHeader";
import { CandidateList } from "@/components/desk/CandidateList";
import { BeginnerPanel } from "@/components/desk/BeginnerPanel";
import { TradingChart } from "@/components/charts/TradingChart";
import { useCandles, useDataProvider } from "@/hooks/useMarketData";
import { useLiveScanner } from "@/hooks/useLiveScanner";
import { useAppMode } from "@/contexts/AppModeContext";
import type { Timeframe } from "@/lib/data/types";

const beginnerContent = {
    title: "Day Trading Desk",
    description: "This desk focuses on intraday (same-day) trading opportunities. You'll find setups that typically last from minutes to hours.",
    terms: [
        {
            term: "VWAP",
            definition: "Volume Weighted Average Price - the average price weighted by volume throughout the day. Price above VWAP = bullish bias.",
        },
        {
            term: "ORB",
            definition: "Opening Range Breakout - when price breaks above/below the first 15-30 minutes trading range.",
        },
        {
            term: "RVOL",
            definition: "Relative Volume - compares current volume to average. RVOL of 2x means twice the normal volume.",
        },
    ],
    warning: "Day trading requires constant attention and quick decisions. Most day traders lose money. Never risk more than you can afford to lose.",
};

export default function DayTradingPage() {
    const [selectedSymbol, setSelectedSymbol] = useState("AAPL");
    const [timeframe, setTimeframe] = useState<Timeframe>("5m");
    const { isMockMode } = useDataProvider();
    const { isLive, isTest } = useAppMode();
    const { candles, loading: chartLoading } = useCandles(selectedSymbol, timeframe, 5);
    const { candidates, loading: scanLoading, rescan, lastScan, isLiveData } = useLiveScanner('day-trading');

    // Convert scanner candidates to CandidateList format
    const candidateListData = candidates.map(c => ({
        id: c.id,
        symbol: c.symbol,
        name: c.name,
        setupType: c.setupType,
        score: c.score,
        confidence: c.confidence,
        priceChange: c.priceChange,
        invalidation: c.invalidation,
        reasons: c.reasons,
    }));

    return (
        <div className="max-w-7xl mx-auto">
            <DeskHeader
                title="Day Trading"
                icon={ChartBarIcon}
                color="desk-day"
                description="Intraday momentum, VWAP reclaims, ORB breakouts, and liquidity analysis."
                stats={[
                    { label: "Candidates", value: candidates.length.toString() },
                    {
                        label: "Avg Score", value: candidates.length > 0
                            ? Math.round(candidates.reduce((a, c) => a + c.score, 0) / candidates.length).toString()
                            : "—"
                    },
                    { label: "Data Mode", value: isLive ? "🔴 LIVE" : "🧪 TEST" },
                ]}
            />

            {/* Mode Banner */}
            <div className={`mt-4 px-4 py-2 rounded-lg text-sm flex items-center justify-between ${isLive
                    ? 'bg-green-600/20 border border-green-600/30 text-green-400'
                    : 'bg-orange-600/20 border border-orange-600/30 text-orange-400'
                }`}>
                <span>
                    {isLive
                        ? '🔴 Live Mode: Showing real market data and signals'
                        : '🧪 Test Mode: Showing simulated data (switch via sidebar)'
                    }
                </span>
                <button
                    onClick={rescan}
                    disabled={scanLoading}
                    className="flex items-center gap-1 px-3 py-1 bg-background-tertiary rounded hover:bg-background text-foreground-muted hover:text-foreground transition-colors"
                >
                    <ArrowPathIcon className={`w-4 h-4 ${scanLoading ? 'animate-spin' : ''}`} />
                    {scanLoading ? 'Scanning...' : 'Rescan'}
                </button>
            </div>

            {/* Chart Section */}
            <div className="mt-6">
                {chartLoading ? (
                    <div className="card p-6 h-[400px] flex items-center justify-center">
                        <span className="text-foreground-muted">Loading chart...</span>
                    </div>
                ) : (
                    <TradingChart
                        candles={candles}
                        symbol={selectedSymbol}
                        timeframe={timeframe}
                        recipe="daytrading"
                        height={350}
                        showTimeframeSelector={true}
                        onTimeframeChange={setTimeframe}
                    />
                )}
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mt-6">
                {/* Main Content - Candidate List */}
                <div className="lg:col-span-2">
                    {scanLoading ? (
                        <div className="card p-8 text-center">
                            <div className="animate-pulse">
                                <div className="text-lg font-semibold text-foreground-muted mb-2">
                                    Scanning markets...
                                </div>
                                <div className="text-sm text-foreground-muted">
                                    Analyzing RSI, MACD, Volume for trading setups
                                </div>
                            </div>
                        </div>
                    ) : candidates.length === 0 ? (
                        <div className="card p-8 text-center">
                            <div className="text-lg font-semibold text-foreground-muted mb-2">
                                No candidates found
                            </div>
                            <div className="text-sm text-foreground-muted mb-4">
                                No strong setups detected in current market conditions
                            </div>
                            <button
                                onClick={rescan}
                                className="btn-primary"
                            >
                                Rescan Now
                            </button>
                        </div>
                    ) : (
                        <CandidateList candidates={candidateListData} />
                    )}

                    {lastScan && (
                        <div className="mt-2 text-xs text-foreground-muted text-right">
                            Last scan: {lastScan.toLocaleTimeString()}
                        </div>
                    )}
                </div>

                {/* Sidebar - Beginner Panel & Filters */}
                <div className="space-y-6">
                    <BeginnerPanel content={beginnerContent} />

                    {/* Symbol Selector */}
                    <div className="card p-4">
                        <h3 className="text-sm font-medium mb-3">Active Symbol</h3>
                        <div className="flex flex-wrap gap-2">
                            {["AAPL", "NVDA", "TSLA", "AMD", "META"].map((sym) => (
                                <button
                                    key={sym}
                                    onClick={() => setSelectedSymbol(sym)}
                                    className={`px-3 py-1.5 text-sm font-mono rounded ${sym === selectedSymbol
                                        ? "bg-accent text-white"
                                        : "bg-background-tertiary text-foreground-muted hover:text-foreground"
                                        }`}
                                >
                                    {sym}
                                </button>
                            ))}
                        </div>
                    </div>

                    {/* Filters */}
                    <div className="card p-4">
                        <h3 className="text-sm font-medium mb-4">Filters</h3>
                        <div className="space-y-3">
                            <div>
                                <label className="text-xs text-foreground-muted">Min Score</label>
                                <input type="range" min="0" max="100" defaultValue="50" className="w-full" />
                            </div>
                            <div>
                                <label className="text-xs text-foreground-muted">Setup Types</label>
                                <div className="flex flex-wrap gap-2 mt-1">
                                    {["VWAP", "ORB", "Momentum", "Level"].map((type) => (
                                        <button key={type} className="btn-ghost text-xs px-2 py-1 rounded">
                                            {type}
                                        </button>
                                    ))}
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}

