/**
 * Rules Engine
 * 
 * Generates trading rules from journal patterns.
 * Provides warnings/blocks based on past mistakes.
 */

import type { JournalEntry, MistakeCategory, LearningRule } from './types';
import { MISTAKE_CATEGORIES } from './types';
import type { DeskType } from '../experts/types';

// Rule generation thresholds
const THRESHOLDS = {
    mistakeCountForRule: 3,     // Min occurrences to create rule
    recentWindowDays: 30,       // Look at last 30 days
    severityMultiplier: 1.5,    // Weight recent mistakes more
};

// Pre-defined rules (always active)
const BUILT_IN_RULES: LearningRule[] = [
    {
        id: 'max-daily-trades',
        createdAt: new Date(),
        name: 'Max Daily Trades',
        description: 'Limit trades per day to prevent overtrading',
        condition: 'More than 5 trades today',
        action: 'warn',
        triggeredCount: 0,
        basedOnMistakes: ['OVERTRADING'],
        active: true,
    },
    {
        id: 'no-revenge-trading',
        createdAt: new Date(),
        name: 'Cooling Off Period',
        description: 'Wait 15 minutes after a loss before next trade',
        condition: 'Trade within 15 min of loss',
        action: 'warn',
        triggeredCount: 0,
        basedOnMistakes: ['REVENGE_TRADE'],
        active: true,
    },
    {
        id: 'position-size-check',
        createdAt: new Date(),
        name: 'Position Size Check',
        description: 'Ensure position size follows risk management',
        condition: 'Position > 5% of portfolio',
        action: 'warn',
        triggeredCount: 0,
        basedOnMistakes: ['WRONG_SIZE'],
        active: true,
    },
];

/**
 * Analyze journal entries and generate rules
 */
export function generateRulesFromJournal(entries: JournalEntry[]): LearningRule[] {
    const rules: LearningRule[] = [...BUILT_IN_RULES];

    // Count mistakes in recent window
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - THRESHOLDS.recentWindowDays);

    const recentEntries = entries.filter(e => e.createdAt >= cutoff);
    const mistakeCounts = new Map<MistakeCategory, { count: number; totalPnl: number }>();

    for (const entry of recentEntries) {
        for (const mistake of entry.mistakes) {
            const existing = mistakeCounts.get(mistake) || { count: 0, totalPnl: 0 };
            existing.count++;
            existing.totalPnl += entry.pnl || 0;
            mistakeCounts.set(mistake, existing);
        }
    }

    // Generate rules for frequent mistakes
    const mistakeEntries = Array.from(mistakeCounts.entries());
    for (const [mistake, data] of mistakeEntries) {
        if (data.count >= THRESHOLDS.mistakeCountForRule) {
            const mistakeInfo = MISTAKE_CATEGORIES[mistake];

            rules.push({
                id: `learned-${mistake.toLowerCase()}`,
                createdAt: new Date(),
                name: `Avoid ${mistakeInfo.label}`,
                description: `You've made this mistake ${data.count} times recently, costing $${Math.abs(data.totalPnl).toFixed(0)}`,
                condition: mistakeInfo.description,
                action: data.count >= 5 ? 'block' : 'warn',
                triggeredCount: data.count,
                basedOnMistakes: [mistake],
                active: true,
            });
        }
    }

    return rules;
}

/**
 * Check if current trade would violate any rules
 */
export interface RuleCheckResult {
    allowed: boolean;
    warnings: string[];
    blocks: string[];
    suggestedSizeReduction?: number;
}

export function checkRules(
    rules: LearningRule[],
    context: {
        symbol: string;
        deskType: DeskType;
        tradesToday: number;
        lastLossTime?: Date;
        positionSizePercent: number;
        setupType?: string;
    }
): RuleCheckResult {
    const result: RuleCheckResult = {
        allowed: true,
        warnings: [],
        blocks: [],
    };

    const activeRules = rules.filter(r => r.active);

    for (const rule of activeRules) {
        let triggered = false;

        // Check built-in rule conditions
        switch (rule.id) {
            case 'max-daily-trades':
                triggered = context.tradesToday >= 5;
                break;

            case 'no-revenge-trading':
                if (context.lastLossTime) {
                    const minsSinceLoss = (Date.now() - context.lastLossTime.getTime()) / 60000;
                    triggered = minsSinceLoss < 15;
                }
                break;

            case 'position-size-check':
                triggered = context.positionSizePercent > 5;
                break;

            default:
                // Learned rules - just warn based on pattern
                triggered = rule.triggeredCount >= 3;
        }

        if (triggered) {
            if (rule.action === 'block') {
                result.allowed = false;
                result.blocks.push(`🚫 ${rule.name}: ${rule.description}`);
            } else if (rule.action === 'warn') {
                result.warnings.push(`⚠️ ${rule.name}: ${rule.description}`);
            } else if (rule.action === 'reduce_size' && rule.reduction) {
                result.suggestedSizeReduction = rule.reduction;
                result.warnings.push(`📉 ${rule.name}: Consider ${rule.reduction}% smaller position`);
            }
        }
    }

    return result;
}

/**
 * Get rule suggestions based on recent performance
 */
export function getRuleSuggestions(entries: JournalEntry[]): string[] {
    const suggestions: string[] = [];

    // Analyze patterns
    const trades = entries.filter(e => e.entryType === 'trade');
    const losses = trades.filter(e => (e.pnl || 0) < 0);

    if (trades.length < 5) {
        return ['Need at least 5 trades to generate suggestions'];
    }

    const winRate = (trades.length - losses.length) / trades.length;

    if (winRate < 0.4) {
        suggestions.push('Consider reducing position sizes while improving win rate');
    }

    // Check for time-of-day patterns
    const morningLosses = losses.filter(e => {
        const hour = e.createdAt.getHours();
        return hour >= 9 && hour < 10;
    });

    if (morningLosses.length > losses.length * 0.4) {
        suggestions.push('Many losses in first hour - consider waiting for market to settle');
    }

    // Check for overtrading
    const avgDailyTrades = trades.length / 30; // Rough estimate
    if (avgDailyTrades > 5) {
        suggestions.push('Averaging many trades per day - consider being more selective');
    }

    return suggestions;
}
