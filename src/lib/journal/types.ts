/**
 * Journal Types
 * 
 * Types for trade journaling, mistake classification, and learning loop.
 */

import type { DeskType } from '../experts/types';

// Entry types for journal
export type EntryType = 'trade' | 'observation' | 'lesson' | 'mistake';

// Trade outcome
export type TradeOutcome =
    | 'win'
    | 'loss'
    | 'breakeven'
    | 'scratch'
    | 'stopped_out'
    | 'target_hit'
    | 'partial';

// Mistake categories (taxonomy)
export const MISTAKE_CATEGORIES = {
    // Entry mistakes
    FOMO: { label: 'FOMO Entry', description: 'Chased price, entered late' },
    EARLY_ENTRY: { label: 'Early Entry', description: 'Entered before confirmation' },
    NO_SETUP: { label: 'No Setup', description: 'Traded without clear setup' },
    WRONG_SIZE: { label: 'Wrong Size', description: 'Position too large/small' },

    // Exit mistakes
    EARLY_EXIT: { label: 'Early Exit', description: 'Exited before target' },
    LATE_EXIT: { label: 'Late Exit', description: 'Held too long, gave back gains' },
    MOVED_STOP: { label: 'Moved Stop', description: 'Widened stop loss' },
    NO_STOP: { label: 'No Stop', description: 'Traded without stop loss' },

    // Emotional mistakes
    REVENGE_TRADE: { label: 'Revenge Trade', description: 'Traded to recover losses' },
    OVERTRADING: { label: 'Overtrading', description: 'Too many trades' },
    AVERAGING_DOWN: { label: 'Averaged Down', description: 'Added to losing position' },
    IGNORED_RULES: { label: 'Ignored Rules', description: 'Broke trading rules' },

    // Analysis mistakes
    WRONG_DIRECTION: { label: 'Wrong Direction', description: 'Misread market bias' },
    BAD_TIMING: { label: 'Bad Timing', description: 'Right idea, wrong time' },
    MISSED_CONTEXT: { label: 'Missed Context', description: 'Ignored market conditions' },
} as const;

export type MistakeCategory = keyof typeof MISTAKE_CATEGORIES;

// Setup types for categorization
export const SETUP_TYPES = {
    // Momentum setups
    BREAKOUT: 'Breakout',
    BREAKDOWN: 'Breakdown',
    FLAG: 'Bull/Bear Flag',
    GAP_PLAY: 'Gap Play',

    // Mean reversion
    OVERSOLD_BOUNCE: 'Oversold Bounce',
    OVERBOUGHT_SHORT: 'Overbought Short',
    VWAP_REVERSION: 'VWAP Reversion',

    // Trend following
    PULLBACK: 'Trend Pullback',
    CONTINUATION: 'Trend Continuation',
    MA_CROSSOVER: 'MA Crossover',

    // Options specific
    EARNINGS_PLAY: 'Earnings Play',
    IV_CRUSH: 'IV Crush Play',
    SPREAD: 'Options Spread',

    // Other
    SCALP: 'Scalp',
    SWING: 'Multi-day Swing',
    OTHER: 'Other',
} as const;

export type SetupType = keyof typeof SETUP_TYPES;

// Journal entry
export interface JournalEntry {
    id: string;
    createdAt: Date;
    updatedAt: Date;

    // Symbol and desk
    symbol: string;
    deskType: DeskType;
    entryType: EntryType;

    // Trade details (for trade entries)
    setupType?: SetupType;
    direction?: 'long' | 'short';
    entryPrice?: number;
    exitPrice?: number;
    positionSize?: number;
    entryTime?: Date;
    exitTime?: Date;

    // Outcome
    outcome?: TradeOutcome;
    pnl?: number;
    pnlPercent?: number;
    rMultiple?: number; // R = (exit - entry) / (entry - stop)

    // Analysis
    notes: string;
    lessonsLearned?: string;
    mistakes: MistakeCategory[];
    whatWentWell?: string;
    whatToImprove?: string;

    // Signals at time of trade
    expertSignals?: string[]; // Expert names that signaled
    mixerScore?: number;

    // Evidence
    screenshotUrls: string[];
    tags: string[];
}

// Trade statistics (computed)
export interface TradeStats {
    totalTrades: number;
    wins: number;
    losses: number;
    winRate: number;
    avgWin: number;
    avgLoss: number;
    profitFactor: number;
    largestWin: number;
    largestLoss: number;
    avgRMultiple: number;
    expectancy: number;

    // By desk
    byDesk: Record<DeskType, {
        trades: number;
        winRate: number;
        pnl: number;
    }>;

    // By setup
    bySetup: Record<string, {
        trades: number;
        winRate: number;
        pnl: number;
    }>;

    // Common mistakes
    topMistakes: Array<{
        category: MistakeCategory;
        count: number;
        costPnl: number;
    }>;
}

// Learning rule (generated from patterns)
export interface LearningRule {
    id: string;
    createdAt: Date;

    // Rule definition
    name: string;
    description: string;
    condition: string; // Human-readable condition

    // Action
    action: 'warn' | 'block' | 'reduce_size';
    reduction?: number; // For reduce_size action

    // Evidence
    triggeredCount: number;
    lastTriggered?: Date;
    basedOnMistakes: MistakeCategory[];

    // Status
    active: boolean;
    expiresAt?: Date;
}

// Expert calibration update
export interface CalibrationUpdate {
    expertName: string;
    deskType: DeskType;

    // Before/after
    previousWeight: number;
    newWeight: number;

    // Evidence
    correctSignals: number;
    totalSignals: number;
    accuracy: number;

    // Timestamp
    calibratedAt: Date;
}
