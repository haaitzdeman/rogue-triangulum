"use client";

import { useState, useEffect, useCallback } from "react";
import { BellAlertIcon, PlusIcon, ArrowPathIcon } from "@heroicons/react/24/outline";
import { DeskHeader } from "@/components/desk/DeskHeader";
import { BeginnerPanel } from "@/components/desk/BeginnerPanel";
import { PolygonProvider } from "@/lib/data";

interface WatchlistItem {
    symbol: string;
    price: number;
    change: number;
    changePercent: number;
}

// User's watchlists (would be stored in database in production)
const WATCHLISTS = [
    {
        id: "1",
        name: "Day Trade Runners",
        symbols: ["AAPL", "NVDA", "TSLA", "AMD"],
    },
    {
        id: "2",
        name: "Swing Setups",
        symbols: ["MSFT", "META", "GOOGL"],
    },
    {
        id: "3",
        name: "Earnings Watch",
        symbols: ["NFLX", "AMZN"],
    },
];

const beginnerContent = {
    title: "Watchlist & Alerts",
    description: "Organize symbols by desk type and get notified when conditions are met.",
    terms: [
        {
            term: "Price Alert",
            definition: "Notification when a stock reaches a specific price level.",
        },
        {
            term: "Volume Spike",
            definition: "Alert when trading volume exceeds a threshold (often 2x average).",
        },
        {
            term: "VWAP Reclaim",
            definition: "Alert when price crosses back above VWAP - potential bullish signal.",
        },
    ],
    warning: "Alerts help you stay aware without staring at screens. But always verify the setup before acting.",
};

export default function WatchlistPage() {
    const [prices, setPrices] = useState<Map<string, WatchlistItem>>(new Map());
    const [loading, setLoading] = useState(true);
    const [lastUpdate, setLastUpdate] = useState<Date | null>(null);

    const allSymbols = Array.from(new Set(WATCHLISTS.flatMap(w => w.symbols)));

    const fetchPrices = useCallback(async () => {
        setLoading(true);
        try {
            const apiKey = process.env.NEXT_PUBLIC_POLYGON_API_KEY || '';
            const provider = new PolygonProvider({ type: 'polygon', apiKey, rateLimit: 5 });
            const newPrices = new Map<string, WatchlistItem>();

            for (const symbol of allSymbols) {
                try {
                    const now = new Date();
                    const weekAgo = new Date();
                    weekAgo.setDate(weekAgo.getDate() - 7);

                    const response = await provider.getCandles(symbol, '1d', weekAgo, now);
                    const candles = (response as any)?.data?.candles || [];

                    if (candles.length >= 2) {
                        const current = candles[candles.length - 1];
                        const prev = candles[candles.length - 2];
                        const change = current.close - prev.close;
                        newPrices.set(symbol, {
                            symbol,
                            price: current.close,
                            change,
                            changePercent: (change / prev.close) * 100,
                        });
                    }
                    await new Promise(r => setTimeout(r, 200));
                } catch (err) {
                    console.error(`Error fetching ${symbol}:`, err);
                }
            }

            setPrices(newPrices);
            setLastUpdate(new Date());
        } catch (err) {
            console.error('Watchlist fetch error:', err);
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        fetchPrices();
    }, [fetchPrices]);

    return (
        <div className="max-w-7xl mx-auto">
            <DeskHeader
                title="Watchlist"
                icon={BellAlertIcon}
                color="desk-watchlist"
                description="Custom watchlists with live prices and smart alerts."
                stats={[
                    { label: "Lists", value: WATCHLISTS.length.toString() },
                    { label: "Symbols", value: allSymbols.length.toString() },
                    { label: "Data", value: "🔴 LIVE" },
                ]}
            />

            {/* Live Data Banner */}
            <div className="mt-4 px-4 py-2 rounded-lg text-sm flex items-center justify-between bg-green-600/20 border border-green-600/30 text-green-400">
                <span>
                    🔴 Live Prices from Polygon API
                </span>
                <button
                    onClick={fetchPrices}
                    disabled={loading}
                    className="flex items-center gap-1 px-3 py-1 bg-background-tertiary rounded hover:bg-background text-foreground-muted hover:text-foreground transition-colors"
                >
                    <ArrowPathIcon className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
                    {loading ? 'Loading...' : 'Refresh'}
                </button>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mt-6">
                <div className="lg:col-span-2 space-y-4">
                    {/* Watchlists */}
                    <div className="flex items-center justify-between mb-2">
                        <h3 className="text-sm font-medium">My Watchlists</h3>
                        <button className="btn-ghost text-xs">
                            <PlusIcon className="w-4 h-4" />
                            New List
                        </button>
                    </div>

                    {loading ? (
                        <div className="card p-8 text-center">
                            <div className="animate-spin w-8 h-8 border-2 border-accent border-t-transparent rounded-full mx-auto mb-2"></div>
                            <div className="text-foreground-muted">Fetching live prices from Polygon...</div>
                        </div>
                    ) : (
                        <div className="space-y-4">
                            {WATCHLISTS.map((list) => (
                                <div key={list.id} className="card p-4">
                                    <div className="flex items-center justify-between mb-3">
                                        <h4 className="font-medium">{list.name}</h4>
                                        <span className="text-xs text-foreground-muted">{list.symbols.length} symbols</span>
                                    </div>
                                    <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                                        {list.symbols.map((symbol) => {
                                            const data = prices.get(symbol);
                                            return (
                                                <div key={symbol} className="p-3 bg-background-tertiary rounded-lg">
                                                    <div className="font-mono font-bold text-accent">{symbol}</div>
                                                    {data ? (
                                                        <>
                                                            <div className="font-mono text-lg">${data.price.toFixed(2)}</div>
                                                            <div className={`text-sm font-mono ${data.change >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                                                                {data.change >= 0 ? '+' : ''}{data.change.toFixed(2)} ({data.changePercent.toFixed(2)}%)
                                                            </div>
                                                        </>
                                                    ) : (
                                                        <div className="text-foreground-muted text-sm">Loading...</div>
                                                    )}
                                                </div>
                                            );
                                        })}
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}

                    {lastUpdate && (
                        <div className="text-xs text-foreground-muted">
                            Last updated: {lastUpdate.toLocaleTimeString()} (Live Polygon Data)
                        </div>
                    )}
                </div>

                <div className="space-y-6">
                    <BeginnerPanel content={beginnerContent} />
                </div>
            </div>
        </div>
    );
}
