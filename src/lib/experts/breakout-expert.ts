/**
 * Breakout Expert
 * 
 * Identifies breakout setups from consolidation patterns.
 * Best for day trading and swing.
 */

import { BaseExpert } from './base-expert';
import type { ExpertConfig, ExpertSignal, DeskType } from './types';

export class BreakoutExpert extends BaseExpert {
    readonly config: ExpertConfig = {
        name: 'Breakout',
        description: 'Identifies breakout patterns from consolidation, ranges, and key levels.',
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
        // Mock breakout analysis
        const mockRVOL = 0.5 + Math.random() * 3; // Relative volume 0.5x - 3.5x
        const mockRangePosition = Math.random(); // 0 = bottom of range, 1 = top
        const mockConsolidationDays = Math.floor(3 + Math.random() * 10);
        const hasVolumeConfirmation = mockRVOL > 1.5;

        let direction: 'long' | 'short' | 'neutral' = 'neutral';
        let strength = 0;
        const reasons: string[] = [];
        const technicalNotes: string[] = [];

        // Breakout above range
        if (mockRangePosition > 0.95) {
            direction = 'long';
            strength += 0.4;
            reasons.push('Breaking above consolidation range');
            technicalNotes.push(`${mockConsolidationDays}-day range breakout`);
        }
        // Breakdown below range
        else if (mockRangePosition < 0.05) {
            direction = 'short';
            strength += 0.4;
            reasons.push('Breaking below consolidation range');
            technicalNotes.push(`${mockConsolidationDays}-day range breakdown`);
        }
        // Near breakout level
        else if (mockRangePosition > 0.85) {
            direction = 'long';
            strength += 0.2;
            reasons.push('Approaching upper range boundary');
            technicalNotes.push('Potential breakout forming');
        } else if (mockRangePosition < 0.15) {
            direction = 'short';
            strength += 0.2;
            reasons.push('Approaching lower range boundary');
            technicalNotes.push('Potential breakdown forming');
        }

        // Volume confirmation
        if (hasVolumeConfirmation && direction !== 'neutral') {
            strength += 0.3;
            reasons.push(`Volume confirmation (${mockRVOL.toFixed(1)}x RVOL)`);
            technicalNotes.push(`RVOL: ${mockRVOL.toFixed(1)}x`);
        }

        // Tight consolidation bonus
        if (mockConsolidationDays >= 5 && direction !== 'neutral') {
            strength += 0.1;
            reasons.push('Tight multi-day consolidation');
        }

        if (strength < 0.3 || direction === 'neutral') {
            return this.createNeutralSignal(symbol, deskType, 'No breakout setup');
        }

        const confidence = hasVolumeConfirmation
            ? Math.min(0.9, strength * 1.2)
            : Math.min(0.7, strength);

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
