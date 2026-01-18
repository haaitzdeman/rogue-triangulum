"use client";

import { useState } from "react";
import { CurrencyDollarIcon, ArrowPathIcon } from "@heroicons/react/24/outline";
import { DeskHeader } from "@/components/desk/DeskHeader";
import { BeginnerPanel } from "@/components/desk/BeginnerPanel";
import { TradingChart } from "@/components/charts/TradingChart";
import { useCandles } from "@/hooks/useMarketData";
import { useLiveOptionsData } from "@/hooks/useLiveOptionsData";
import { useAppMode } from "@/contexts/AppModeContext";
import type { Timeframe } from "@/lib/data/types";

const beginnerContent = {
    title: "Options Desk",
    description: "This desk focuses on options trading opportunities. Options are contracts that give you the right to buy or sell stock at a specific price.",
    terms: [
        {
            term: "HV Rank",
            definition: "Historical Volatility Rank - where current volatility stands vs past year. High HV = good for selling premium.",
        },
        {
            term: "HV20/HV50",
            definition: "20-day and 50-day Historical Volatility. Annualized standard deviation of returns.",
        },
        {
            term: "Volume Ratio",
            definition: "Current volume vs average. High ratio = unusual activity worth investigating.",
        },
    ],
    warning: "Options can expire worthless. Never risk money you can't afford to lose. Start with simple strategies.",
};

const strategies = [
    { name: "Covered Call", risk: "Low", hvBias: "High HV preferred", description: "Sell calls on shares you own" },
    { name: "Cash-Secured Put", risk: "Low", hvBias: "High HV preferred", description: "Sell puts with cash to buy" },
    { name: "Vertical Spread", risk: "Defined", hvBias: "Neutral", description: "Buy/sell same expiry, different strikes" },
    { name: "Iron Condor", risk: "Defined", hvBias: "High HV preferred", description: "Sell OTM put spread + call spread" },
];

export default function OptionsPage() {
    const [selectedSymbol, setSelectedSymbol] = useState("AAPL");
    const [timeframe, setTimeframe] = useState<Timeframe>("1d");
    const { isLive } = useAppMode();
    const { candles, loading: chartLoading } = useCandles(selectedSymbol, timeframe, 60);
    const { data: optionsData, loading: dataLoading, refresh, lastUpdate, isLiveData } = useLiveOptionsData();

    const selectedStock = optionsData.find(o => o.symbol === selectedSymbol) || optionsData[0];
    const highHVCount = optionsData.filter(o => o.hvRank > 70).length;

    return (
        <div className="max-w-7xl mx-auto">
            <DeskHeader
                title="Options"
                icon={CurrencyDollarIcon}
                color="desk-options"
                description="Volatility analysis, HV rank screening, and strategy templates."
                stats={[
                    { label: "High HV Rank", value: `${highHVCount} stocks` },
                    { label: "Symbols", value: optionsData.length.toString() },
                    { label: "Data", value: isLiveData ? "🔴 LIVE" : "Loading..." },
                ]}
            />

            {/* Live Data Banner */}
            <div className="mt-4 px-4 py-2 rounded-lg text-sm flex items-center justify-between bg-green-600/20 border border-green-600/30 text-green-400">
                <span>
                    🔴 Live Data from Polygon API - Real historical volatility calculated from stock prices
                </span>
                <button
                    onClick={refresh}
                    disabled={dataLoading}
                    className="flex items-center gap-1 px-3 py-1 bg-background-tertiary rounded hover:bg-background text-foreground-muted hover:text-foreground transition-colors"
                >
                    <ArrowPathIcon className={`w-4 h-4 ${dataLoading ? 'animate-spin' : ''}`} />
                    {dataLoading ? 'Loading...' : 'Refresh'}
                </button>
            </div>

            {/* Chart Section */}
            <div className="mt-6">
                {chartLoading ? (
                    <div className="card p-6 h-[300px] flex items-center justify-center">
                        <span className="text-foreground-muted">Loading chart...</span>
                    </div>
                ) : (
                    <TradingChart
                        candles={candles}
                        symbol={selectedSymbol}
                        timeframe={timeframe}
                        recipe="swing"
                        height={280}
                        showTimeframeSelector={true}
                        onTimeframeChange={setTimeframe}
                    />
                )}
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mt-6">
                <div className="lg:col-span-2 space-y-6">
                    {/* HV Rank Scanner - LIVE DATA */}
                    <div className="card p-6">
                        <h2 className="text-lg font-semibold mb-4">📊 Volatility Scanner (Live Polygon Data)</h2>
                        {dataLoading ? (
                            <div className="text-center py-8">
                                <div className="animate-spin w-8 h-8 border-2 border-accent border-t-transparent rounded-full mx-auto mb-2"></div>
                                <div className="text-foreground-muted">Fetching live data from Polygon...</div>
                            </div>
                        ) : (
                            <div className="overflow-x-auto">
                                <table className="w-full text-sm">
                                    <thead>
                                        <tr className="text-left text-foreground-muted border-b border-card-border">
                                            <th className="pb-2">Symbol</th>
                                            <th className="pb-2">Price</th>
                                            <th className="pb-2">HV Rank</th>
                                            <th className="pb-2">HV 20d</th>
                                            <th className="pb-2">HV 50d</th>
                                            <th className="pb-2">Vol Ratio</th>
                                            <th className="pb-2">Trend</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {optionsData.map((opt) => (
                                            <tr
                                                key={opt.symbol}
                                                className={`border-b border-card-border hover:bg-background-tertiary cursor-pointer ${opt.symbol === selectedSymbol ? 'bg-accent/10' : ''
                                                    }`}
                                                onClick={() => setSelectedSymbol(opt.symbol)}
                                            >
                                                <td className="py-3 font-mono font-bold">{opt.symbol}</td>
                                                <td className="py-3">
                                                    <span className="font-mono">${opt.currentPrice.toFixed(2)}</span>
                                                    <span className={`ml-2 text-xs ${opt.priceChangePercent >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                                                        {opt.priceChangePercent >= 0 ? '+' : ''}{opt.priceChangePercent.toFixed(2)}%
                                                    </span>
                                                </td>
                                                <td className="py-3">
                                                    <div className="flex items-center gap-2">
                                                        <div className="w-16 h-2 bg-background-tertiary rounded-full overflow-hidden">
                                                            <div
                                                                className={`h-full rounded-full ${opt.hvRank > 70 ? 'bg-green-500' :
                                                                        opt.hvRank > 40 ? 'bg-yellow-500' : 'bg-red-500'
                                                                    }`}
                                                                style={{ width: `${opt.hvRank}%` }}
                                                            />
                                                        </div>
                                                        <span>{opt.hvRank}%</span>
                                                    </div>
                                                </td>
                                                <td className="py-3 font-mono">{opt.hv20.toFixed(1)}%</td>
                                                <td className="py-3 font-mono">{opt.hv50.toFixed(1)}%</td>
                                                <td className="py-3">
                                                    <span className={opt.volumeRatio > 1.5 ? 'text-yellow-400 font-bold' : ''}>
                                                        {opt.volumeRatio.toFixed(2)}x
                                                    </span>
                                                </td>
                                                <td className="py-3">
                                                    <span className={`px-2 py-0.5 rounded text-xs ${opt.trend === 'bullish' ? 'bg-green-600/20 text-green-400' :
                                                            opt.trend === 'bearish' ? 'bg-red-600/20 text-red-400' :
                                                                'bg-background-tertiary text-foreground-muted'
                                                        }`}>
                                                        {opt.trend === 'bullish' ? '↑ Bull' :
                                                            opt.trend === 'bearish' ? '↓ Bear' : '→ Neutral'}
                                                    </span>
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        )}
                        {lastUpdate && (
                            <div className="mt-3 text-xs text-foreground-muted">
                                Last updated: {lastUpdate.toLocaleTimeString()} (Live Polygon Data)
                            </div>
                        )}
                    </div>

                    {/* Strategy Templates */}
                    <div className="card p-6">
                        <h2 className="text-lg font-semibold mb-4">📋 Strategy Templates</h2>
                        <div className="grid grid-cols-2 gap-4">
                            {strategies.map((strategy) => (
                                <div key={strategy.name} className="p-4 bg-background-tertiary rounded-lg hover:bg-background transition-colors cursor-pointer">
                                    <div className="font-semibold text-foreground">{strategy.name}</div>
                                    <div className="text-xs text-foreground-muted mt-1">{strategy.description}</div>
                                    <div className="flex gap-2 mt-2">
                                        <span className="text-2xs px-1.5 py-0.5 bg-background rounded">
                                            Risk: {strategy.risk}
                                        </span>
                                        <span className="text-2xs px-1.5 py-0.5 bg-background rounded">
                                            {strategy.hvBias}
                                        </span>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                </div>

                <div className="space-y-6">
                    <BeginnerPanel content={beginnerContent} />

                    {/* Selected Symbol Stats - LIVE DATA */}
                    {selectedStock && (
                        <div className="card p-4">
                            <h3 className="text-sm font-medium mb-3">{selectedStock.symbol} Stats (Live)</h3>
                            <div className="space-y-2 text-sm">
                                <div className="flex justify-between">
                                    <span className="text-foreground-muted">Current Price</span>
                                    <span className="font-mono">${selectedStock.currentPrice.toFixed(2)}</span>
                                </div>
                                <div className="flex justify-between">
                                    <span className="text-foreground-muted">52W High</span>
                                    <span className="font-mono">${selectedStock.high52w.toFixed(2)}</span>
                                </div>
                                <div className="flex justify-between">
                                    <span className="text-foreground-muted">52W Low</span>
                                    <span className="font-mono">${selectedStock.low52w.toFixed(2)}</span>
                                </div>
                                <div className="flex justify-between">
                                    <span className="text-foreground-muted">HV 20-day</span>
                                    <span className="font-mono">{selectedStock.hv20.toFixed(1)}%</span>
                                </div>
                                <div className="flex justify-between">
                                    <span className="text-foreground-muted">HV 50-day</span>
                                    <span className="font-mono">{selectedStock.hv50.toFixed(1)}%</span>
                                </div>
                                <div className="flex justify-between pt-2 border-t border-card-border">
                                    <span className="text-foreground-muted">HV Rank</span>
                                    <span className={`font-bold ${selectedStock.hvRank > 70 ? 'text-green-400' : 'text-foreground'}`}>
                                        {selectedStock.hvRank}%
                                    </span>
                                </div>
                            </div>
                        </div>
                    )}

                    {/* Symbol Selector */}
                    <div className="card p-4">
                        <h3 className="text-sm font-medium mb-3">Select Symbol</h3>
                        <div className="flex flex-wrap gap-2">
                            {optionsData.map((opt) => (
                                <button
                                    key={opt.symbol}
                                    onClick={() => setSelectedSymbol(opt.symbol)}
                                    className={`px-3 py-1.5 text-sm font-mono rounded ${opt.symbol === selectedSymbol
                                        ? "bg-accent text-white"
                                        : "bg-background-tertiary text-foreground-muted hover:text-foreground"
                                        }`}
                                >
                                    {opt.symbol}
                                    {opt.hvRank > 70 && <span className="ml-1 text-green-400">●</span>}
                                </button>
                            ))}
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}
