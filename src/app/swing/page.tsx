"use client";

import { useState } from "react";
import { ArrowTrendingUpIcon, ArrowPathIcon } from "@heroicons/react/24/outline";
import { DeskHeader } from "@/components/desk/DeskHeader";
import { CandidateList } from "@/components/desk/CandidateList";
import { BeginnerPanel } from "@/components/desk/BeginnerPanel";
import { TradingChart } from "@/components/charts/TradingChart";
import { useCandles, useDataProvider } from "@/hooks/useMarketData";
import { useLiveScanner } from "@/hooks/useLiveScanner";
import { useAppMode } from "@/contexts/AppModeContext";
import type { Timeframe } from "@/lib/data/types";

const beginnerContent = {
    title: "Swing Trading Desk",
    description: "This desk focuses on multi-day to multi-week trading opportunities. Setups typically last 2-10 trading days.",
    terms: [
        {
            term: "Trend",
            definition: "The overall direction of price movement. Uptrend = higher highs and higher lows.",
        },
        {
            term: "Pullback",
            definition: "A temporary price decline within an uptrend. Good pullbacks offer entry points.",
        },
        {
            term: "Relative Strength",
            definition: "How a stock performs vs the market (SPY). Positive RS = stock outperforming.",
        },
    ],
    warning: "Swing trades require patience and discipline. Set stop losses before entering. Don't average down on losing positions.",
};

export default function SwingTradingPage() {
    const [selectedSymbol, setSelectedSymbol] = useState("MSFT");
    const [timeframe, setTimeframe] = useState<Timeframe>("1d");
    const { isMockMode } = useDataProvider();
    const { isLive, isTest } = useAppMode();
    const { candles, loading: chartLoading } = useCandles(selectedSymbol, timeframe, 60);
    const { candidates, loading: scanLoading, rescan, lastScan } = useLiveScanner('swing');

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
                title="Swing Trading"
                icon={ArrowTrendingUpIcon}
                color="desk-swing"
                description="Multi-day setups, trend following, and relative strength analysis."
                stats={[
                    { label: "Candidates", value: candidates.length.toString() },
                    { label: "Uptrends", value: candidates.filter(c => c.direction === 'long').length.toString() },
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
                        ? '🔴 Live Mode: Showing real swing trading setups'
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

            {/* Chart Section - Daily timeframe for swing trading */}
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
                        recipe="swing"
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
                                    Scanning for swing setups...
                                </div>
                                <div className="text-sm text-foreground-muted">
                                    Analyzing trends, pullbacks, and relative strength
                                </div>
                            </div>
                        </div>
                    ) : candidates.length === 0 ? (
                        <div className="card p-8 text-center">
                            <div className="text-lg font-semibold text-foreground-muted mb-2">
                                No swing candidates found
                            </div>
                            <div className="text-sm text-foreground-muted mb-4">
                                No strong multi-day setups detected
                            </div>
                            <button onClick={rescan} className="btn-primary">
                                Rescan Now
                            </button>
                        </div>
                    ) : (
                        <CandidateList candidates={candidateListData} deskType="swing" />
                    )}

                    {lastScan && (
                        <div className="mt-2 text-xs text-foreground-muted text-right">
                            Last scan: {lastScan.toLocaleTimeString()}
                        </div>
                    )}
                </div>

                {/* Sidebar */}
                <div className="space-y-6">
                    <BeginnerPanel content={beginnerContent} />

                    {/* Symbol Selector */}
                    <div className="card p-4">
                        <h3 className="text-sm font-medium mb-3">Active Symbol</h3>
                        <div className="flex flex-wrap gap-2">
                            {["MSFT", "META", "GOOGL", "AMZN", "SPY"].map((sym) => (
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

                    {/* Setup Types */}
                    <div className="card p-4">
                        <h3 className="text-sm font-medium mb-4">Setup Filters</h3>
                        <div className="space-y-3">
                            <div className="flex flex-wrap gap-2">
                                {["Trend Pullback", "Breakout", "Mean Reversion", "Gap Fill"].map((type) => (
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
    );
}

