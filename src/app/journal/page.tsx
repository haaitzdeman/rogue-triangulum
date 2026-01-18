"use client";

import { useState, useEffect, useCallback } from "react";
import { BookOpenIcon, PlusIcon, ArrowPathIcon } from "@heroicons/react/24/outline";
import { DeskHeader } from "@/components/desk/DeskHeader";
import { BeginnerPanel } from "@/components/desk/BeginnerPanel";
import { PolygonProvider } from "@/lib/data";

interface JournalEntry {
    id: string;
    symbol: string;
    date: string;
    outcome: 'win' | 'loss';
    pnl: number;
    lessons: string[];
    mistakeTags: string[];
    currentPrice?: number;
}

// Journal entries (would be stored in database in production)
// Fetching live prices for the symbols in entries
const JOURNAL_ENTRIES: JournalEntry[] = [
    {
        id: "1",
        symbol: "AAPL",
        date: "2024-01-15",
        outcome: "win",
        pnl: 285,
        lessons: ["Followed plan", "Good entry patience"],
        mistakeTags: [],
    },
    {
        id: "2",
        symbol: "TSLA",
        date: "2024-01-14",
        outcome: "loss",
        pnl: -150,
        lessons: ["Should have respected stop"],
        mistakeTags: ["moved_stop", "chased"],
    },
    {
        id: "3",
        symbol: "NVDA",
        date: "2024-01-13",
        outcome: "win",
        pnl: 420,
        lessons: ["Trend following works"],
        mistakeTags: [],
    },
];

const beginnerContent = {
    title: "Journal & Review Desk",
    description: "Track every trading decision, log outcomes, and learn from mistakes. This is where the learning loop happens.",
    terms: [
        {
            term: "Thesis",
            definition: "Your reason for taking a trade. 'I think X because Y.' Clear thesis = better review.",
        },
        {
            term: "Invalidation",
            definition: "The price level that proves your thesis wrong. If hit, you exit without emotion.",
        },
        {
            term: "Process Quality",
            definition: "Did you follow your rules? A losing trade can still be high-quality process.",
        },
    ],
    warning: "The journal is mandatory for the learning loop. Skipping entries means the system can't learn from your decisions.",
};

interface LiveStats {
    totalPnL: number;
    winRate: number;
    totalTrades: number;
}

export default function JournalPage() {
    const [entries] = useState<JournalEntry[]>(JOURNAL_ENTRIES);
    const [prices, setPrices] = useState<Map<string, number>>(new Map());
    const [loading, setLoading] = useState(true);
    const [stats, setStats] = useState<LiveStats>({ totalPnL: 0, winRate: 0, totalTrades: 0 });

    const fetchPrices = useCallback(async () => {
        setLoading(true);
        try {
            const apiKey = process.env.NEXT_PUBLIC_POLYGON_API_KEY || '';
            const provider = new PolygonProvider({ type: 'polygon', apiKey, rateLimit: 5 });
            const symbols = Array.from(new Set(entries.map(e => e.symbol)));
            const newPrices = new Map<string, number>();

            for (const symbol of symbols) {
                try {
                    const now = new Date();
                    const weekAgo = new Date();
                    weekAgo.setDate(weekAgo.getDate() - 7);

                    const response = await provider.getCandles(symbol, '1d', weekAgo, now);
                    const responseData = response as { data?: { candles?: Array<{ close: number }> } };
                    const candles = responseData?.data?.candles || [];

                    if (candles.length > 0) {
                        newPrices.set(symbol, candles[candles.length - 1].close);
                    }
                    await new Promise(r => setTimeout(r, 200));
                } catch (err) {
                    console.error(`Error fetching ${symbol}:`, err);
                }
            }

            setPrices(newPrices);

            // Calculate stats from entries
            const wins = entries.filter(e => e.outcome === 'win').length;
            const total = entries.length;
            const pnl = entries.reduce((sum, e) => sum + e.pnl, 0);
            setStats({
                totalPnL: pnl,
                winRate: total > 0 ? (wins / total) * 100 : 0,
                totalTrades: total,
            });
        } catch (err) {
            console.error('Journal fetch error:', err);
        } finally {
            setLoading(false);
        }
    }, [entries]);

    useEffect(() => {
        fetchPrices();
    }, [fetchPrices]);

    return (
        <div className="max-w-7xl mx-auto">
            <DeskHeader
                title="Journal"
                icon={BookOpenIcon}
                color="desk-journal"
                description="Track decisions, log outcomes, classify mistakes, and learn."
                stats={[
                    { label: "Total Entries", value: stats.totalTrades.toString() },
                    { label: "Win Rate", value: `${stats.winRate.toFixed(0)}%` },
                    { label: "Data", value: "🔴 LIVE" },
                ]}
            />

            {/* Live Data Banner */}
            <div className="mt-4 px-4 py-2 rounded-lg text-sm flex items-center justify-between bg-green-600/20 border border-green-600/30 text-green-400">
                <span>
                    🔴 Live Prices from Polygon API for journal symbols
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
                    {/* P&L Summary */}
                    <div className="grid grid-cols-3 gap-4">
                        <div className="card p-4 text-center">
                            <div className="text-sm text-foreground-muted">Total P&L</div>
                            <div className={`text-2xl font-mono font-bold ${stats.totalPnL >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                                {stats.totalPnL >= 0 ? '+' : ''}${stats.totalPnL}
                            </div>
                        </div>
                        <div className="card p-4 text-center">
                            <div className="text-sm text-foreground-muted">Win Rate</div>
                            <div className="text-2xl font-mono font-bold text-foreground">
                                {stats.winRate.toFixed(1)}%
                            </div>
                        </div>
                        <div className="card p-4 text-center">
                            <div className="text-sm text-foreground-muted">Total Trades</div>
                            <div className="text-2xl font-mono font-bold text-foreground">
                                {stats.totalTrades}
                            </div>
                        </div>
                    </div>

                    {/* New Entry Button */}
                    <button className="btn-primary w-full">
                        <PlusIcon className="w-5 h-5" />
                        New Journal Entry
                    </button>

                    {/* Recent Entries */}
                    <div className="card p-4">
                        <h3 className="text-sm font-medium mb-4">Recent Entries (with Live Prices)</h3>
                        <div className="space-y-3">
                            {entries.map((entry) => {
                                const currentPrice = prices.get(entry.symbol);
                                return (
                                    <div key={entry.id} className="flex items-center justify-between p-3 rounded-lg bg-background-secondary">
                                        <div className="flex items-center gap-3">
                                            <span className={`w-2 h-2 rounded-full ${entry.outcome === "win" ? "bg-bullish" : "bg-bearish"}`} />
                                            <div>
                                                <span className="font-mono font-medium">{entry.symbol}</span>
                                                {currentPrice && (
                                                    <span className="text-xs text-accent ml-2">Now: ${currentPrice.toFixed(2)}</span>
                                                )}
                                                <span className="text-xs text-foreground-muted ml-2">{entry.date}</span>
                                            </div>
                                        </div>
                                        <div className="flex items-center gap-4">
                                            {entry.mistakeTags.length > 0 && (
                                                <div className="flex gap-1">
                                                    {entry.mistakeTags.map((tag) => (
                                                        <span key={tag} className="badge badge-bearish text-2xs">{tag}</span>
                                                    ))}
                                                </div>
                                            )}
                                            <span className={`font-mono ${entry.pnl >= 0 ? "text-bullish" : "text-bearish"}`}>
                                                {entry.pnl >= 0 ? "+" : ""}{entry.pnl}
                                            </span>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    </div>

                    {/* Mistake Analysis */}
                    <div className="card p-4">
                        <h3 className="text-sm font-medium mb-4">Top Mistakes (from Entries)</h3>
                        <div className="space-y-2">
                            {[
                                { tag: "chased", count: entries.filter(e => e.mistakeTags.includes('chased')).length },
                                { tag: "moved_stop", count: entries.filter(e => e.mistakeTags.includes('moved_stop')).length },
                            ].filter(m => m.count > 0).map((mistake) => (
                                <div key={mistake.tag} className="flex items-center justify-between text-sm">
                                    <span className="badge badge-bearish">{mistake.tag}</span>
                                    <span className="text-foreground-muted">{mistake.count} times</span>
                                </div>
                            ))}
                        </div>
                    </div>
                </div>

                <div className="space-y-6">
                    <BeginnerPanel content={beginnerContent} />

                    {/* Model Change Log */}
                    <div className="card p-4">
                        <h3 className="text-sm font-medium mb-3">Model Updates</h3>
                        <p className="text-xs text-foreground-muted">
                            The learning loop adjusts expert weights based on your outcomes.
                            View the full changelog in the Brain section.
                        </p>
                    </div>
                </div>
            </div>
        </div>
    );
}
