/**
 * Base Expert Class
 * 
 * Abstract base class for all trading experts.
 * Each expert analyzes specific patterns or indicators.
 */

import type {
    Expert,
    ExpertConfig,
    ExpertSignal,
    DeskType
} from './types';

export abstract class BaseExpert implements Expert {
    abstract readonly config: ExpertConfig;

    /**
     * Analyze symbols and generate signals
     */
    abstract analyze(
        symbols: string[],
        deskType: DeskType
    ): Promise<ExpertSignal[]>;

    /**
     * Generate human-readable explanation for signal
     */
    explain(signal: ExpertSignal): string {
        const direction = signal.direction === 'long' ? 'bullish' :
            signal.direction === 'short' ? 'bearish' : 'neutral';

        const strength = signal.strength >= 0.7 ? 'strong' :
            signal.strength >= 0.4 ? 'moderate' : 'weak';

        let explanation = `${this.config.name}: ${strength} ${direction} signal`;

        if (signal.reasons.length > 0) {
            explanation += `. ${signal.reasons[0]}`;
        }

        if (signal.invalidation) {
            explanation += `. Invalidates below $${signal.invalidation.toFixed(2)}`;
        }

        return explanation;
    }

    /**
     * Check if this expert supports the given desk type
     */
    supportsDesk(deskType: DeskType): boolean {
        return this.config.supportedDesks.includes(deskType);
    }

    /**
     * Create a signal with default metadata
     */
    protected createSignal(
        symbol: string,
        deskType: DeskType,
        params: Partial<ExpertSignal>
    ): ExpertSignal {
        return {
            expertName: this.config.name,
            symbol,
            deskType,
            direction: params.direction || 'neutral',
            strength: params.strength || 0,
            confidence: params.confidence || 0.5,
            reasons: params.reasons || [],
            technicalNotes: params.technicalNotes || [],
            invalidation: params.invalidation,
            target: params.target,
            riskReward: params.riskReward,
            timestamp: Date.now(),
            expiresAt: params.expiresAt,
        };
    }

    /**
     * Create a neutral (no signal) response
     */
    protected createNeutralSignal(
        symbol: string,
        deskType: DeskType,
        reason: string
    ): ExpertSignal {
        return this.createSignal(symbol, deskType, {
            direction: 'neutral',
            strength: 0,
            confidence: 0.5,
            reasons: [reason],
        });
    }
}
