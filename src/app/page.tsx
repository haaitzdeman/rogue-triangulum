import Link from "next/link";
import {
  ChartBarIcon,
  CurrencyDollarIcon,
  ArrowTrendingUpIcon,
  BuildingLibraryIcon,
  BookOpenIcon,
  BellAlertIcon,
  ArrowRightIcon
} from "@heroicons/react/24/outline";

const desks = [
  {
    name: "Day Trading",
    href: "/day-trading",
    icon: ChartBarIcon,
    color: "from-desk-day to-purple-600",
    description: "Intraday momentum, VWAP reclaims, ORB breakouts, and liquidity analysis.",
    features: ["VWAP bands", "Volume profile", "Level 2 data", "Halt risk"],
  },
  {
    name: "Options",
    href: "/options",
    icon: CurrencyDollarIcon,
    color: "from-desk-options to-cyan-600",
    description: "IV rank analysis, options chain, Greeks, and strategy templates.",
    features: ["IV percentile", "Gamma exposure", "Strategy builder", "P/L scenarios"],
  },
  {
    name: "Swing Trading",
    href: "/swing",
    icon: ArrowTrendingUpIcon,
    color: "from-desk-swing to-orange-600",
    description: "Multi-day setups, trend following, and relative strength analysis.",
    features: ["Trend state", "RS vs market", "Volume patterns", "Support/resistance"],
  },
  {
    name: "Investing",
    href: "/investing",
    icon: BuildingLibraryIcon,
    color: "from-desk-invest to-green-600",
    description: "Long-term quality screens, fundamentals, and DCA planning.",
    features: ["Fundamentals", "Drawdown risk", "DCA planner", "Risk checklist"],
  },
  {
    name: "Journal",
    href: "/journal",
    icon: BookOpenIcon,
    color: "from-desk-journal to-pink-600",
    description: "Track decisions, log outcomes, classify mistakes, and learn.",
    features: ["Trade log", "Mistake tags", "Lessons learned", "Model updates"],
  },
  {
    name: "Watchlist",
    href: "/watchlist",
    icon: BellAlertIcon,
    color: "from-desk-watchlist to-yellow-600",
    description: "Custom watchlists with smart alerts and monitoring.",
    features: ["Price alerts", "IV spikes", "Volume surges", "Trend changes"],
  },
];

export default function HomePage() {
  return (
    <div className="max-w-7xl mx-auto">
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-gradient mb-2">
          Welcome to Rogue Triangulum
        </h1>
        <p className="text-foreground-muted text-lg">
          Your personal stock market intelligence cockpit. Choose a desk to begin.
        </p>
      </div>

      {/* Quick Stats */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-8">
        <div className="metric-card">
          <div className="metric-label">Market Regime</div>
          <div className="metric-value text-caution">Risk-Off</div>
        </div>
        <div className="metric-card">
          <div className="metric-label">VIX Level</div>
          <div className="metric-value">18.42</div>
        </div>
        <div className="metric-card">
          <div className="metric-label">Active Watchlist</div>
          <div className="metric-value">12 symbols</div>
        </div>
        <div className="metric-card">
          <div className="metric-label">Journal Streak</div>
          <div className="metric-value text-bullish">5 days</div>
        </div>
      </div>

      {/* Desk Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {desks.map((desk) => {
          const Icon = desk.icon;
          return (
            <Link key={desk.name} href={desk.href} className="card-interactive p-6 group">
              <div className="flex items-start gap-4">
                <div className={`p-3 rounded-lg bg-gradient-to-br ${desk.color}`}>
                  <Icon className="w-6 h-6 text-white" />
                </div>
                <div className="flex-1">
                  <div className="flex items-center justify-between mb-2">
                    <h2 className="text-lg font-semibold text-foreground group-hover:text-accent transition-colors">
                      {desk.name}
                    </h2>
                    <ArrowRightIcon className="w-4 h-4 text-foreground-muted group-hover:text-accent group-hover:translate-x-1 transition-all" />
                  </div>
                  <p className="text-sm text-foreground-muted mb-4">
                    {desk.description}
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {desk.features.map((feature) => (
                      <span key={feature} className="badge badge-neutral">
                        {feature}
                      </span>
                    ))}
                  </div>
                </div>
              </div>
            </Link>
          );
        })}
      </div>

      {/* Beginner Hint */}
      <div className="mt-8 explain-panel">
        <p className="text-sm">
          <span className="explain-term">New here?</span> Start with the{" "}
          <Link href="/swing" className="text-accent hover:underline">Swing Trading</Link> desk
          for multi-day setups, or explore the{" "}
          <Link href="/journal" className="text-accent hover:underline">Journal</Link> to
          understand how the learning loop works.
        </p>
      </div>
    </div>
  );
}
