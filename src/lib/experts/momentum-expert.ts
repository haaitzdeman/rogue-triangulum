/**
 * Momentum Expert
 * 
 * Analyzes price momentum using RSI, MACD, and rate of change.
 * Best for day trading and swing setups.
 */

import { BaseExpert } from './base-expert';
import type { ExpertConfig, ExpertSignal, DeskType } from './types';

export class MomentumExpert extends BaseExpert {
    readonly config: ExpertConfig = {
        name: 'Momentum',
        description: 'Identifies stocks with strong price momentum using RSI, MACD, and rate of change.',
        supportedDesks: ['day-trading', 'swing'],
        defaultWeight: 0.15,
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
            // Mock analysis - in production, this would use real indicator data
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
        // Simulate momentum analysis
        // In production: fetch RSI, MACD, ROC from data provider
        const mockRSI = 30 + Math.random() * 40; // RSI between 30-70
        const mockMACD = (Math.random() - 0.5) * 5;
        const mockROC = (Math.random() - 0.5) * 10;

        // Determine signal based on indicators
        let direction: 'long' | 'short' | 'neutral' = 'neutral';
        let strength = 0;
        const reasons: string[] = [];
        const technicalNotes: string[] = [];

        // RSI analysis
        if (mockRSI > 60) {
            direction = 'long';
            strength += 0.3;
            reasons.push('RSI showing bullish momentum');
            technicalNotes.push(`RSI: ${mockRSI.toFixed(1)}`);
        } else if (mockRSI < 40) {
            direction = 'short';
            strength += 0.3;
            reasons.push('RSI showing bearish momentum');
            technicalNotes.push(`RSI: ${mockRSI.toFixed(1)}`);
        }

        // MACD analysis
        if (mockMACD > 1) {
            if (direction !== 'short') direction = 'long';
            strength += 0.3;
            reasons.push('MACD bullish crossover');
            technicalNotes.push(`MACD: ${mockMACD.toFixed(2)}`);
        } else if (mockMACD < -1) {
            if (direction !== 'long') direction = 'short';
            strength += 0.3;
            reasons.push('MACD bearish crossover');
            technicalNotes.push(`MACD: ${mockMACD.toFixed(2)}`);
        }

        // ROC analysis
        if (mockROC > 3) {
            if (direction !== 'short') direction = 'long';
            strength += 0.2;
            reasons.push('Strong upward rate of change');
            technicalNotes.push(`ROC: ${mockROC.toFixed(1)}%`);
        } else if (mockROC < -3) {
            if (direction !== 'long') direction = 'short';
            strength += 0.2;
            reasons.push('Strong downward rate of change');
            technicalNotes.push(`ROC: ${mockROC.toFixed(1)}%`);
        }

        // Minimum threshold
        if (strength < 0.3 || direction === 'neutral') {
            return this.createNeutralSignal(symbol, deskType, 'No clear momentum signal');
        }

        // Calculate confidence based on indicator agreement
        const confidence = Math.min(0.9, strength * 1.2);

        return this.createSignal(symbol, deskType, {
            direction,
            strength: Math.min(1, strength),
            confidence,
            reasons,
            technicalNotes,
            expiresAt: Date.now() + (deskType === 'day-trading' ? 3600000 : 86400000),
        });
    }
}
