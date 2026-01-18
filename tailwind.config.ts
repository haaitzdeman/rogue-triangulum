import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  darkMode: "class",
  theme: {
    extend: {
      colors: {
        // Dark trading theme
        background: {
          DEFAULT: "var(--bg-primary)",
          secondary: "var(--bg-secondary)",
          tertiary: "var(--bg-tertiary)",
        },
        foreground: {
          DEFAULT: "var(--text-primary)",
          muted: "var(--text-muted)",
        },
        // Risk/signal colors
        bullish: {
          DEFAULT: "#10b981",
          light: "#34d399",
          dark: "#059669",
        },
        bearish: {
          DEFAULT: "#ef4444",
          light: "#f87171",
          dark: "#dc2626",
        },
        caution: {
          DEFAULT: "#f59e0b",
          light: "#fbbf24",
          dark: "#d97706",
        },
        // Accent
        accent: {
          DEFAULT: "#3b82f6",
          light: "#60a5fa",
          dark: "#2563eb",
        },
        // Confidence levels
        confidence: {
          high: "#10b981",
          medium: "#f59e0b",
          low: "#ef4444",
        },
        // Desk-specific accents
        desk: {
          day: "#8b5cf6",      // Purple for day trading
          options: "#06b6d4",  // Cyan for options
          swing: "#f97316",    // Orange for swing
          invest: "#22c55e",   // Green for investing
          journal: "#ec4899", // Pink for journal
          watchlist: "#eab308", // Yellow for watchlist
        },
        // Card backgrounds
        card: {
          DEFAULT: "var(--card-bg)",
          hover: "var(--card-hover)",
          border: "var(--card-border)",
        },
      },
      fontFamily: {
        sans: ["Inter", "system-ui", "sans-serif"],
        mono: ["JetBrains Mono", "monospace"],
      },
      fontSize: {
        "2xs": ["0.625rem", { lineHeight: "0.875rem" }],
      },
      animation: {
        "pulse-slow": "pulse 3s cubic-bezier(0.4, 0, 0.6, 1) infinite",
        "fade-in": "fadeIn 0.3s ease-in-out",
        "slide-up": "slideUp 0.3s ease-out",
        "slide-down": "slideDown 0.3s ease-out",
      },
      keyframes: {
        fadeIn: {
          "0%": { opacity: "0" },
          "100%": { opacity: "1" },
        },
        slideUp: {
          "0%": { transform: "translateY(10px)", opacity: "0" },
          "100%": { transform: "translateY(0)", opacity: "1" },
        },
        slideDown: {
          "0%": { transform: "translateY(-10px)", opacity: "0" },
          "100%": { transform: "translateY(0)", opacity: "1" },
        },
      },
      boxShadow: {
        "glow-bullish": "0 0 20px rgba(16, 185, 129, 0.3)",
        "glow-bearish": "0 0 20px rgba(239, 68, 68, 0.3)",
        "glow-accent": "0 0 20px rgba(59, 130, 246, 0.3)",
      },
    },
  },
  plugins: [],
};

export default config;
