/**
 * Trend Following Expert
 * 
 * Identifies stocks in established trends using moving averages.
 * Best for swing and investing.
 */

import { BaseExpert } from './base-expert';
import type { ExpertConfig, ExpertSignal, DeskType } from './types';

export class TrendFollowingExpert extends BaseExpert {
    readonly config: ExpertConfig = {
        name: 'Trend Following',
        description: 'Identifies stocks in established trends using moving average alignment and ADX.',
        supportedDesks: ['swing', 'investing'],
        defaultWeight: 0.18,
    };

    async analyze(
        symbols: string[],
        deskType: DeskType
    ): Promise<ExpertSignal[]> {
        if (!this.supportsDesk(deskType)) {
            return [];
        }

        const signals: ExpertSignal[] = [];

        for (const symbol of symbols) {
            const signal = await this.analyzeSymbol(symbol, deskType);
            if (signal) {
                signals.push(signal);
            }
        }

        return signals;
    }

    private async analyzeSymbol(
        symbol: string,
        deskType: DeskType
    ): Promise<ExpertSignal | null> {
        // Mock trend analysis
        const priceAbove20MA = Math.random() > 0.4;
        const priceAbove50MA = Math.random() > 0.45;
        const priceAbove200MA = Math.random() > 0.5;
        const mockADX = 15 + Math.random() * 35; // ADX 15-50
        const ma20Above50 = Math.random() > 0.5;
        const ma50Above200 = Math.random() > 0.5;

        let direction: 'long' | 'short' | 'neutral' = 'neutral';
        let strength = 0;
        const reasons: string[] = [];
        const technicalNotes: string[] = [];

        // Moving average alignment (bullish)
        if (priceAbove20MA && priceAbove50MA && priceAbove200MA) {
            direction = 'long';
            strength += 0.4;
            reasons.push('Price above all major moving averages');
            technicalNotes.push('Above 20MA, 50MA, 200MA');
        }
        // Moving average alignment (bearish)
        else if (!priceAbove20MA && !priceAbove50MA && !priceAbove200MA) {
            direction = 'short';
            strength += 0.4;
            reasons.push('Price below all major moving averages');
            technicalNotes.push('Below 20MA, 50MA, 200MA');
        }
        // Partial alignment
        else if (priceAbove200MA && priceAbove50MA) {
            direction = 'long';
            strength += 0.2;
            reasons.push('Price above 50MA and 200MA');
        }

        // MA stacking (golden cross tendency)
        if (ma20Above50 && ma50Above200 && direction === 'long') {
            strength += 0.2;
            reasons.push('Moving averages properly stacked');
            technicalNotes.push('20MA > 50MA > 200MA');
        } else if (!ma20Above50 && !ma50Above200 && direction === 'short') {
            strength += 0.2;
            reasons.push('Bearish MA alignment');
            technicalNotes.push('20MA < 50MA < 200MA');
        }

        // ADX trend strength
        if (mockADX > 25) {
            strength += 0.2;
            reasons.push('Strong trend confirmed by ADX');
            technicalNotes.push(`ADX: ${mockADX.toFixed(1)}`);
        } else if (mockADX < 20) {
            strength *= 0.7; // Reduce strength for weak trends
            technicalNotes.push(`ADX: ${mockADX.toFixed(1)} (weak trend)`);
        }

        if (strength < 0.25 || direction === 'neutral') {
            return this.createNeutralSignal(symbol, deskType, 'No clear trend');
        }

        const confidence = mockADX > 25
            ? Math.min(0.9, strength * 1.3)
            : Math.min(0.75, strength);

        return this.createSignal(symbol, deskType, {
            direction,
            strength: Math.min(1, strength),
            confidence,
            reasons,
            technicalNotes,
            expiresAt: Date.now() + 86400000 * 3, // 3 days for trend signals
        });
    }
}
