"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
    ChartBarIcon,
    CurrencyDollarIcon,
    ArrowTrendingUpIcon,
    BuildingLibraryIcon,
    BookOpenIcon,
    BellAlertIcon,
    Cog6ToothIcon,
    BeakerIcon,
    QuestionMarkCircleIcon,
    SignalIcon,
    BeakerIcon as FlaskIcon,
    SunIcon,
} from "@heroicons/react/24/outline";
import { useBeginnerMode } from "@/components/providers/BeginnerModeProvider";
import { useAppMode } from "@/contexts/AppModeContext";

interface NavItem {
    name: string;
    href: string;
    icon: React.ComponentType<{ className?: string }>;
    color: string;
    description: string;
}

const desks: NavItem[] = [
    {
        name: "Day Trading",
        href: "/day-trading",
        icon: ChartBarIcon,
        color: "border-desk-day",
        description: "Intraday momentum, VWAP, levels",
    },
    {
        name: "Premarket",
        href: "/premarket",
        icon: SunIcon,
        color: "border-amber-500",
        description: "Gap scanner, early signals",
    },
    {
        name: "Options",
        href: "/options",
        icon: CurrencyDollarIcon,
        color: "border-desk-options",
        description: "IV rank, Greeks, strategies",
    },
    {
        name: "Swing Trading",
        href: "/swing",
        icon: ArrowTrendingUpIcon,
        color: "border-desk-swing",
        description: "Multi-day setups, trends",
    },
    {
        name: "Investing",
        href: "/investing",
        icon: BuildingLibraryIcon,
        color: "border-desk-invest",
        description: "Long-term, fundamentals",
    },
    {
        name: "Journal",
        href: "/journal",
        icon: BookOpenIcon,
        color: "border-desk-journal",
        description: "Track decisions & learn",
    },
    {
        name: "Watchlist",
        href: "/watchlist",
        icon: BellAlertIcon,
        color: "border-desk-watchlist",
        description: "Alerts & custom lists",
    },
];

const utilityItems: NavItem[] = [
    {
        name: "Brain",
        href: "/brain",
        icon: BeakerIcon,
        color: "border-accent",
        description: "Expert system & learning",
    },
    {
        name: "Settings",
        href: "/settings",
        icon: Cog6ToothIcon,
        color: "border-foreground-muted",
        description: "Configuration",
    },
];

export function Sidebar() {
    const pathname = usePathname();
    const { beginnerMode, toggleBeginnerMode } = useBeginnerMode();
    const { setMode, isLive } = useAppMode();
    const [showModeWarning, setShowModeWarning] = useState(false);

    const handleModeSwitch = () => {
        if (!isLive) {
            // Switching TO live - show warning
            setShowModeWarning(true);
        } else {
            // Switching TO test - safe
            setMode('test');
        }
    };

    const confirmLiveMode = () => {
        setMode('live');
        setShowModeWarning(false);
    };

    return (
        <>
            {/* Mode Switch Warning Modal */}
            {showModeWarning && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70">
                    <div className="bg-background-secondary border border-card-border rounded-lg p-6 max-w-md mx-4">
                        <h3 className="text-lg font-bold text-green-400 mb-2">⚠️ Switch to Live Mode?</h3>
                        <p className="text-foreground-muted text-sm mb-4">
                            Live mode uses real market data and generates real trading signals.
                            Only use this when you are ready to make actual trading decisions.
                        </p>
                        <div className="flex gap-3">
                            <button
                                onClick={() => setShowModeWarning(false)}
                                className="flex-1 px-4 py-2 bg-background-tertiary text-foreground rounded hover:bg-background"
                            >
                                Cancel
                            </button>
                            <button
                                onClick={confirmLiveMode}
                                className="flex-1 px-4 py-2 bg-green-600 text-white rounded hover:bg-green-700 font-bold"
                            >
                                Go Live
                            </button>
                        </div>
                    </div>
                </div>
            )}

            <aside className="fixed left-0 top-10 bottom-0 w-64 bg-background-secondary border-r border-card-border">
                <div className="flex flex-col h-full">
                    {/* Logo */}
                    <div className="p-4 border-b border-card-border">
                        <Link href="/" className="flex items-center gap-3">
                            <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-accent to-accent-light flex items-center justify-center">
                                <span className="text-white font-bold text-lg">RT</span>
                            </div>
                            <div>
                                <h1 className="text-sm font-bold text-foreground">Rogue Triangulum</h1>
                                <p className="text-2xs text-foreground-muted">Market Intelligence</p>
                            </div>
                        </Link>
                    </div>

                    {/* Mode Toggle at Top */}
                    <div className="p-3 border-b border-card-border">
                        <button
                            onClick={handleModeSwitch}
                            className={`w-full flex items-center gap-2 px-3 py-2 rounded-lg text-sm transition-colors ${isLive
                                ? "bg-green-600/20 text-green-400 border border-green-600/30 hover:bg-green-600/30"
                                : "bg-orange-600/20 text-orange-400 border border-orange-600/30 hover:bg-orange-600/30"
                                }`}
                        >
                            {isLive ? (
                                <SignalIcon className="w-5 h-5" />
                            ) : (
                                <FlaskIcon className="w-5 h-5" />
                            )}
                            <span className="font-bold">{isLive ? '🔴 LIVE MODE' : '🧪 TEST MODE'}</span>
                            <span className={`ml-auto text-2xs px-1.5 py-0.5 rounded font-bold ${isLive ? "bg-green-600 text-white" : "bg-orange-600 text-white"
                                }`}>
                                SWITCH
                            </span>
                        </button>
                    </div>

                    {/* Desk Navigation */}
                    <nav className="flex-1 py-4 overflow-y-auto">
                        <div className="px-3 mb-2">
                            <span className="text-2xs font-medium text-foreground-muted uppercase tracking-wider">
                                Desks
                            </span>
                        </div>

                        {desks.map((item) => {
                            const isActive = pathname === item.href || pathname.startsWith(item.href + "/");
                            const Icon = item.icon;

                            return (
                                <Link
                                    key={item.name}
                                    href={item.href}
                                    className={`desk-tab ${isActive ? `desk-tab-active ${item.color}` : ""}`}
                                >
                                    <Icon className="w-5 h-5 flex-shrink-0" />
                                    <div className="flex-1 min-w-0">
                                        <span className="block truncate">{item.name}</span>
                                        {beginnerMode && (
                                            <span className="block text-2xs text-foreground-muted truncate">
                                                {item.description}
                                            </span>
                                        )}
                                    </div>
                                </Link>
                            );
                        })}

                        <div className="px-3 mt-6 mb-2">
                            <span className="text-2xs font-medium text-foreground-muted uppercase tracking-wider">
                                System
                            </span>
                        </div>

                        {utilityItems.map((item) => {
                            const isActive = pathname === item.href;
                            const Icon = item.icon;

                            return (
                                <Link
                                    key={item.name}
                                    href={item.href}
                                    className={`desk-tab ${isActive ? `desk-tab-active ${item.color}` : ""}`}
                                >
                                    <Icon className="w-5 h-5 flex-shrink-0" />
                                    <span className="truncate">{item.name}</span>
                                </Link>
                            );
                        })}
                    </nav>

                    {/* Beginner Mode Only at Bottom */}
                    <div className="p-4 border-t border-card-border">

                        {/* Beginner Mode Toggle */}
                        <button
                            onClick={toggleBeginnerMode}
                            className={`w-full flex items-center gap-2 px-3 py-2 rounded-lg text-sm transition-colors ${beginnerMode
                                ? "bg-accent/20 text-accent border border-accent/30"
                                : "bg-background-tertiary text-foreground-muted hover:text-foreground"
                                }`}
                        >
                            <QuestionMarkCircleIcon className="w-5 h-5" />
                            <span>Beginner Mode</span>
                            <span className={`ml-auto text-2xs px-1.5 py-0.5 rounded ${beginnerMode ? "bg-accent text-white" : "bg-background text-foreground-muted"
                                }`}>
                                {beginnerMode ? "ON" : "OFF"}
                            </span>
                        </button>
                    </div>
                </div>
            </aside>
        </>
    );
}

