/**
 * Mean Reversion Expert
 * 
 * Identifies oversold/overbought conditions for reversal trades.
 * Best for day trading and options.
 */

import { BaseExpert } from './base-expert';
import type { ExpertConfig, ExpertSignal, DeskType } from './types';

export class MeanReversionExpert extends BaseExpert {
    readonly config: ExpertConfig = {
        name: 'Mean Reversion',
        description: 'Identifies oversold/overbought conditions using Bollinger Bands, RSI extremes, and standard deviation.',
        supportedDesks: ['day-trading', 'options', 'swing'],
        defaultWeight: 0.12,
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
        // Mock mean reversion analysis
        const mockRSI = 20 + Math.random() * 60; // RSI 20-80 range
        const mockBBPosition = Math.random(); // 0 = lower band, 1 = upper band
        const mockStdDev = 1 + Math.random() * 2; // Standard deviations from mean

        let direction: 'long' | 'short' | 'neutral' = 'neutral';
        let strength = 0;
        const reasons: string[] = [];
        const technicalNotes: string[] = [];

        // RSI extremes (oversold/overbought)
        if (mockRSI < 30) {
            direction = 'long';
            strength += 0.4;
            reasons.push('RSI oversold - potential bounce');
            technicalNotes.push(`RSI: ${mockRSI.toFixed(1)} (oversold)`);
        } else if (mockRSI > 70) {
            direction = 'short';
            strength += 0.4;
            reasons.push('RSI overbought - potential pullback');
            technicalNotes.push(`RSI: ${mockRSI.toFixed(1)} (overbought)`);
        }

        // Bollinger Band position
        if (mockBBPosition < 0.1) {
            if (direction !== 'short') direction = 'long';
            strength += 0.3;
            reasons.push('Price at lower Bollinger Band');
            technicalNotes.push('Price touching lower BB');
        } else if (mockBBPosition > 0.9) {
            if (direction !== 'long') direction = 'short';
            strength += 0.3;
            reasons.push('Price at upper Bollinger Band');
            technicalNotes.push('Price touching upper BB');
        }

        // Extended from mean
        if (mockStdDev > 2) {
            strength += 0.2;
            reasons.push(`Extended ${mockStdDev.toFixed(1)} std devs from mean`);
            technicalNotes.push(`${mockStdDev.toFixed(1)}σ extension`);
        }

        if (strength < 0.3 || direction === 'neutral') {
            return this.createNeutralSignal(symbol, deskType, 'No mean reversion setup');
        }

        const confidence = Math.min(0.85, strength * 1.1);

        return this.createSignal(symbol, deskType, {
            direction,
            strength: Math.min(1, strength),
            confidence,
            reasons,
            technicalNotes,
            expiresAt: Date.now() + 7200000, // 2 hours for mean reversion
        });
    }
}
