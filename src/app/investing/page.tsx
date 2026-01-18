"use client";

import { useState, useEffect, useCallback } from "react";
import { BuildingLibraryIcon, ArrowPathIcon } from "@heroicons/react/24/outline";
import { DeskHeader } from "@/components/desk/DeskHeader";
import { BeginnerPanel } from "@/components/desk/BeginnerPanel";
import { TradingChart } from "@/components/charts/TradingChart";
import { useCandles } from "@/hooks/useMarketData";
import { PolygonProvider } from "@/lib/data";
import type { Timeframe, Candle } from "@/lib/data/types";

const beginnerContent = {
    title: "Investing Desk",
    description: "This desk focuses on long-term investment opportunities. Positions are typically held for months to years.",
    terms: [
        {
            term: "YTD Return",
            definition: "Year-to-date return. How much the asset has gained/lost since January 1st.",
        },
        {
            term: "52W Range",
            definition: "The highest and lowest prices over the past 52 weeks (1 year).",
        },
        {
            term: "Trend",
            definition: "The overall direction based on moving averages. Bullish when price > SMA50 > SMA200.",
        },
    ],
    warning: "Past performance doesn't guarantee future results. Diversification reduces but doesn't eliminate risk.",
};

interface SectorData {
    symbol: string;
    name: string;
    currentPrice: number;
    ytdReturn: number;
    high52w: number;
    low52w: number;
    percentFrom52wHigh: number;
    trend: 'bullish' | 'bearish' | 'neutral';
    avgVolume: number;
}

const SECTOR_ETFS = [
    { symbol: 'XLK', name: 'Technology' },
    { symbol: 'XLF', name: 'Financials' },
    { symbol: 'XLV', name: 'Healthcare' },
    { symbol: 'XLE', name: 'Energy' },
    { symbol: 'XLY', name: 'Consumer Disc' },
    { symbol: 'SPY', name: 'S&P 500' },
    { symbol: 'QQQ', name: 'NASDAQ 100' },
];

async function fetchSectorData(provider: PolygonProvider): Promise<SectorData[]> {
    const results: SectorData[] = [];
    const now = new Date();
    const yearStart = new Date(now.getFullYear(), 0, 1);
    const yearAgo = new Date();
    yearAgo.setFullYear(yearAgo.getFullYear() - 1);

    for (const etf of SECTOR_ETFS) {
        try {
            const response = await provider.getCandles(etf.symbol, '1d', yearAgo, now);
            const responseData = response as { data?: { candles?: Candle[] } };
            const candles: Candle[] = responseData?.data?.candles || [];

            if (candles.length < 50) continue;

            const current = candles[candles.length - 1];
            const prices = candles.map(c => c.close);
            const high52w = Math.max(...prices);
            const low52w = Math.min(...prices);

            // Find YTD start price
            const ytdStartIdx = candles.findIndex(c => new Date(c.timestamp) >= yearStart);
            const ytdStartPrice = ytdStartIdx >= 0 ? candles[ytdStartIdx].close : candles[0].close;
            const ytdReturn = ((current.close - ytdStartPrice) / ytdStartPrice) * 100;

            // Trend based on SMAs
            const sma50 = candles.slice(-50).reduce((a, c) => a + c.close, 0) / 50;
            const sma200 = candles.length >= 200
                ? candles.slice(-200).reduce((a, c) => a + c.close, 0) / 200
                : sma50;

            let trend: 'bullish' | 'bearish' | 'neutral' = 'neutral';
            if (current.close > sma50 && sma50 > sma200) trend = 'bullish';
            else if (current.close < sma50 && sma50 < sma200) trend = 'bearish';

            const avgVolume = candles.slice(-20).reduce((a, c) => a + c.volume, 0) / 20;

            results.push({
                symbol: etf.symbol,
                name: etf.name,
                currentPrice: current.close,
                ytdReturn,
                high52w,
                low52w,
                percentFrom52wHigh: ((current.close - high52w) / high52w) * 100,
                trend,
                avgVolume,
            });

            await new Promise(r => setTimeout(r, 200));
        } catch (err) {
            console.error(`Error fetching ${etf.symbol}:`, err);
        }
    }

    return results;
}

export default function InvestingPage() {
    const [selectedSymbol, setSelectedSymbol] = useState("SPY");
    const [timeframe, setTimeframe] = useState<Timeframe>("1d");
    const { candles, loading: chartLoading } = useCandles(selectedSymbol, timeframe, 120);
    const [sectorData, setSectorData] = useState<SectorData[]>([]);
    const [loading, setLoading] = useState(true);
    const [lastUpdate, setLastUpdate] = useState<Date | null>(null);

    const fetchData = useCallback(async () => {
        setLoading(true);
        try {
            const apiKey = process.env.NEXT_PUBLIC_POLYGON_API_KEY || '';
            const provider = new PolygonProvider({ type: 'polygon', apiKey, rateLimit: 5 });
            const data = await fetchSectorData(provider);
            setSectorData(data);
            setLastUpdate(new Date());
        } catch (err) {
            console.error('Failed to fetch sector data:', err);
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        fetchData();
    }, [fetchData]);

    const selectedSector = sectorData.find(s => s.symbol === selectedSymbol) || sectorData[0];
    const bullishCount = sectorData.filter(s => s.trend === 'bullish').length;

    return (
        <div className="max-w-7xl mx-auto">
            <DeskHeader
                title="Investing"
                icon={BuildingLibraryIcon}
                color="desk-invest"
                description="Long-term sector analysis and ETF performance tracking."
                stats={[
                    { label: "Bullish Sectors", value: `${bullishCount}/${sectorData.length}` },
                    { label: "ETFs Tracked", value: sectorData.length.toString() },
                    { label: "Data", value: "🔴 LIVE" },
                ]}
            />

            {/* Live Data Banner */}
            <div className="mt-4 px-4 py-2 rounded-lg text-sm flex items-center justify-between bg-green-600/20 border border-green-600/30 text-green-400">
                <span>
                    🔴 Live Data from Polygon API - Real sector ETF performance
                </span>
                <button
                    onClick={fetchData}
                    disabled={loading}
                    className="flex items-center gap-1 px-3 py-1 bg-background-tertiary rounded hover:bg-background text-foreground-muted hover:text-foreground transition-colors"
                >
                    <ArrowPathIcon className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
                    {loading ? 'Loading...' : 'Refresh'}
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
                    {/* Sector Performance - LIVE DATA */}
                    <div className="card p-6">
                        <h2 className="text-lg font-semibold mb-4">📈 Sector & ETF Performance (Live Polygon Data)</h2>
                        {loading ? (
                            <div className="text-center py-8">
                                <div className="animate-spin w-8 h-8 border-2 border-accent border-t-transparent rounded-full mx-auto mb-2"></div>
                                <div className="text-foreground-muted">Fetching live sector data from Polygon...</div>
                            </div>
                        ) : (
                            <div className="overflow-x-auto">
                                <table className="w-full text-sm">
                                    <thead>
                                        <tr className="text-left text-foreground-muted border-b border-card-border">
                                            <th className="pb-2">Symbol</th>
                                            <th className="pb-2">Sector</th>
                                            <th className="pb-2">Price</th>
                                            <th className="pb-2">YTD</th>
                                            <th className="pb-2">From 52W High</th>
                                            <th className="pb-2">Trend</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {sectorData.map((sector) => (
                                            <tr
                                                key={sector.symbol}
                                                className={`border-b border-card-border hover:bg-background-tertiary cursor-pointer ${sector.symbol === selectedSymbol ? 'bg-accent/10' : ''
                                                    }`}
                                                onClick={() => setSelectedSymbol(sector.symbol)}
                                            >
                                                <td className="py-3 font-mono font-bold">{sector.symbol}</td>
                                                <td className="py-3">{sector.name}</td>
                                                <td className="py-3 font-mono">${sector.currentPrice.toFixed(2)}</td>
                                                <td className={`py-3 font-mono ${sector.ytdReturn > 0 ? 'text-green-400' : 'text-red-400'}`}>
                                                    {sector.ytdReturn > 0 ? '+' : ''}{sector.ytdReturn.toFixed(1)}%
                                                </td>
                                                <td className="py-3 font-mono text-foreground-muted">
                                                    {sector.percentFrom52wHigh.toFixed(1)}%
                                                </td>
                                                <td className="py-3">
                                                    <span className={`px-2 py-0.5 rounded text-xs ${sector.trend === 'bullish' ? 'bg-green-600/20 text-green-400' :
                                                        sector.trend === 'bearish' ? 'bg-red-600/20 text-red-400' :
                                                            'bg-background-tertiary text-foreground-muted'
                                                        }`}>
                                                        {sector.trend === 'bullish' ? '↑ Bullish' :
                                                            sector.trend === 'bearish' ? '↓ Bearish' : '→ Neutral'}
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
                </div>

                <div className="space-y-6">
                    <BeginnerPanel content={beginnerContent} />

                    {/* Selected Sector Details - LIVE DATA */}
                    {selectedSector && (
                        <div className="card p-4">
                            <h3 className="text-sm font-medium mb-3">{selectedSector.symbol} Details (Live)</h3>
                            <div className="space-y-2 text-sm">
                                <div className="flex justify-between">
                                    <span className="text-foreground-muted">Sector</span>
                                    <span>{selectedSector.name}</span>
                                </div>
                                <div className="flex justify-between">
                                    <span className="text-foreground-muted">Current Price</span>
                                    <span className="font-mono">${selectedSector.currentPrice.toFixed(2)}</span>
                                </div>
                                <div className="flex justify-between">
                                    <span className="text-foreground-muted">52W High</span>
                                    <span className="font-mono">${selectedSector.high52w.toFixed(2)}</span>
                                </div>
                                <div className="flex justify-between">
                                    <span className="text-foreground-muted">52W Low</span>
                                    <span className="font-mono">${selectedSector.low52w.toFixed(2)}</span>
                                </div>
                                <div className="flex justify-between">
                                    <span className="text-foreground-muted">YTD Return</span>
                                    <span className={`font-mono ${selectedSector.ytdReturn > 0 ? 'text-green-400' : 'text-red-400'}`}>
                                        {selectedSector.ytdReturn > 0 ? '+' : ''}{selectedSector.ytdReturn.toFixed(1)}%
                                    </span>
                                </div>
                                <div className="flex justify-between pt-2 border-t border-card-border">
                                    <span className="text-foreground-muted">Trend</span>
                                    <span className={`font-bold ${selectedSector.trend === 'bullish' ? 'text-green-400' :
                                        selectedSector.trend === 'bearish' ? 'text-red-400' : 'text-foreground'
                                        }`}>
                                        {selectedSector.trend === 'bullish' ? '↑ Bullish' :
                                            selectedSector.trend === 'bearish' ? '↓ Bearish' : '→ Neutral'}
                                    </span>
                                </div>
                            </div>
                        </div>
                    )}

                    {/* ETF Selector */}
                    <div className="card p-4">
                        <h3 className="text-sm font-medium mb-3">Select ETF/Sector</h3>
                        <div className="flex flex-wrap gap-2">
                            {sectorData.map((sector) => (
                                <button
                                    key={sector.symbol}
                                    onClick={() => setSelectedSymbol(sector.symbol)}
                                    className={`px-3 py-1.5 text-sm font-mono rounded ${sector.symbol === selectedSymbol
                                        ? "bg-accent text-white"
                                        : "bg-background-tertiary text-foreground-muted hover:text-foreground"
                                        }`}
                                >
                                    {sector.symbol}
                                </button>
                            ))}
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}
