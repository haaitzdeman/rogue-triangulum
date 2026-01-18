/**
 * Explanation Generator
 * 
 * Generates human-readable and beginner-friendly explanations
 * for ranked candidates and expert signals.
 */

import type { RankedCandidate, ExpertContribution } from './types';

// Beginner-friendly term mappings
const BEGINNER_TERMS: Record<string, string> = {
    'Momentum': 'Price Movement Strength',
    'Mean Reversion': 'Bounce Potential',
    'Breakout': 'Breaking Out',
    'Trend Following': 'Following the Trend',
    'RSI': 'Strength Indicator',
    'MACD': 'Trend Direction',
    'Bollinger Bands': 'Price Bands',
    'ADX': 'Trend Strength',
    'RVOL': 'Volume Activity',
    'invalidation': 'Stop Loss Level',
    'long': 'bullish (expecting price to rise)',
    'short': 'bearish (expecting price to fall)',
};

export interface Explanation {
    summary: string;
    beginnerSummary: string;
    details: string[];
    warnings: string[];
    riskLevel: 'low' | 'medium' | 'high';
}

/**
 * Generate explanation for a ranked candidate
 */
export function explainCandidate(
    candidate: RankedCandidate,
    beginnerMode = false
): Explanation {
    const { score, confidence, direction, reasons, expertContributions } = candidate;

    // Determine risk level
    const riskLevel = score >= 75 && confidence >= 0.7 ? 'low' :
        score >= 50 && confidence >= 0.5 ? 'medium' : 'high';

    // Build summary
    const directionText = direction === 'long' ? 'bullish' :
        direction === 'short' ? 'bearish' : 'neutral';

    const summary = `${candidate.symbol} shows a ${directionText} setup with a score of ${score}/100. ` +
        `${expertContributions.length} experts agree with ${Math.round(confidence * 100)}% confidence.`;

    // Beginner-friendly version
    const beginnerDirection = beginnerMode && BEGINNER_TERMS[direction]
        ? BEGINNER_TERMS[direction]
        : directionText;

    const beginnerSummary = `${candidate.symbol} looks ${beginnerDirection}. ` +
        `Our analysis gives it a ${score}/100 score. ` +
        (score >= 70
            ? 'This is a strong setup.'
            : score >= 50
                ? 'This setup has potential but watch closely.'
                : 'This setup needs more confirmation.');

    // Detailed explanations
    const details: string[] = [];

    // Add top contributing experts
    const sortedContributions = [...expertContributions]
        .sort((a, b) => b.contribution - a.contribution);

    for (const contrib of sortedContributions.slice(0, 3)) {
        const expertLabel = beginnerMode
            ? (BEGINNER_TERMS[contrib.expertName] || contrib.expertName)
            : contrib.expertName;

        details.push(
            `${expertLabel}: Contributed ${Math.round(contrib.contribution)} points ` +
            `(${Math.round(contrib.weight * 100)}% weight)`
        );
    }

    // Add reasons
    for (const reason of reasons.slice(0, 2)) {
        details.push(reason);
    }

    // Warnings
    const warnings: string[] = [];

    if (confidence < 0.5) {
        warnings.push(beginnerMode
            ? 'Low confidence - experts are not fully aligned'
            : `Low confidence (${Math.round(confidence * 100)}%)`);
    }

    if (candidate.signalCount < 3) {
        warnings.push(beginnerMode
            ? 'Only a few indicators agree on this setup'
            : `Limited expert coverage (${candidate.signalCount} signals)`);
    }

    if (candidate.invalidation) {
        const invalidationText = beginnerMode
            ? `Exit trade if price drops below $${candidate.invalidation.toFixed(2)}`
            : `Invalidation: $${candidate.invalidation.toFixed(2)}`;
        warnings.push(invalidationText);
    }

    if (riskLevel === 'high') {
        warnings.push(beginnerMode
            ? '⚠️ Higher risk setup - consider smaller position size'
            : '⚠️ Elevated risk - proceed with caution');
    }

    return {
        summary,
        beginnerSummary,
        details,
        warnings,
        riskLevel,
    };
}

/**
 * Generate a one-line explanation for quick display
 */
export function quickExplain(candidate: RankedCandidate): string {
    const direction = candidate.direction === 'long' ? '📈' :
        candidate.direction === 'short' ? '📉' : '➖';

    return `${direction} ${candidate.symbol}: Score ${candidate.score} | ` +
        `${candidate.expertContributions.length} experts | ` +
        `${candidate.reasons[0] || 'Multiple signals'}`;
}

/**
 * Format contribution breakdown for display
 */
export function formatContributions(
    contributions: ExpertContribution[],
    beginnerMode = false
): string[] {
    return contributions
        .sort((a, b) => b.contribution - a.contribution)
        .map(c => {
            const name = beginnerMode
                ? (BEGINNER_TERMS[c.expertName] || c.expertName)
                : c.expertName;
            return `${name}: ${Math.round(c.contribution)} pts (${Math.round(c.weight * 100)}%)`;
        });
}
