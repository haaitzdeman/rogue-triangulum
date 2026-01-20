/**
 * Orchestrator Service
 * 
 * Routes user actions to the correct specialist brain based on active desk.
 * Never places orders directly - only TradeGate can do that.
 * 
 * NOTE: Signal Journal recording is handled in useLiveScanner.tsx (UI layer).
 */

import type {
    DeskType,
    MarketContext,
    RankedCandidate,
    BrainPrediction,
    TradeIntent,
    Explanation,
} from '../core/types';
import type { SpecialistBrain } from '../brains/interface';

/**
 * Orchestrator manages routing between specialist brains
 */
export class Orchestrator {
    private brains: Map<DeskType, SpecialistBrain> = new Map();
    private activeDesk: DeskType = 'day-trading';

    /**
     * Register a specialist brain
     */
    registerBrain(brain: SpecialistBrain): void {
        this.brains.set(brain.desk, brain);
        console.log(`[Orchestrator] Registered brain: ${brain.config.name}`);
    }

    /**
     * Set the active desk
     */
    setActiveDesk(desk: DeskType): void {
        if (!this.brains.has(desk)) {
            console.warn(`[Orchestrator] No brain registered for desk: ${desk}`);
        }
        this.activeDesk = desk;
        console.log(`[Orchestrator] Active desk set to: ${desk}`);
    }

    /**
     * Get the active desk
     */
    getActiveDesk(): DeskType {
        return this.activeDesk;
    }

    /**
     * Get the active brain
     */
    getActiveBrain(): SpecialistBrain | null {
        return this.brains.get(this.activeDesk) || null;
    }

    /**
     * Get available desks (those with registered brains)
     */
    getAvailableDesks(): DeskType[] {
        return Array.from(this.brains.keys());
    }

    /**
     * Request candidates from active brain
     */
    async requestCandidates(context: MarketContext): Promise<RankedCandidate[]> {
        const brain = this.getActiveBrain();

        if (!brain) {
            console.warn(`[Orchestrator] No brain for desk: ${this.activeDesk}`);
            return [];
        }

        try {
            // Get candidates from brain
            const candidates = await brain.scanCandidates(context);

            // Rank them
            const ranked: RankedCandidate[] = candidates
                .sort((a, b) => b.score - a.score)
                .map((candidate, index) => ({
                    ...candidate,
                    rank: index + 1,
                }));



            console.log(`[Orchestrator] Found ${ranked.length} candidates for ${this.activeDesk}`);
            return ranked;
        } catch (error) {
            console.error(`[Orchestrator] Error scanning candidates:`, error);
            return [];
        }
    }


    /**
     * Request full prediction for a candidate
     */
    async requestPrediction(
        symbol: string,
        context: MarketContext
    ): Promise<BrainPrediction | null> {
        const brain = this.getActiveBrain();

        if (!brain) {
            return null;
        }

        try {
            // First get the candidate
            const candidates = await brain.scanCandidates(context);
            const candidate = candidates.find(c => c.symbol === symbol);

            if (!candidate) {
                console.warn(`[Orchestrator] Candidate not found: ${symbol}`);
                return null;
            }

            // Build features
            const features = await brain.buildFeatures(candidate, context);

            // Generate prediction
            const prediction = await brain.predict(candidate, features, context);

            console.log(`[Orchestrator] Generated prediction for ${symbol}`);
            return prediction;
        } catch (error) {
            console.error(`[Orchestrator] Error generating prediction:`, error);
            return null;
        }
    }

    /**
     * Get explanation for a prediction
     */
    explainPrediction(prediction: BrainPrediction): Explanation | null {
        const brain = this.brains.get(prediction.brainType);

        if (!brain) {
            return null;
        }

        return brain.explain(prediction);
    }

    /**
     * Propose a trade intent
     * Returns null if brain declines to propose
     */
    async proposeTrade(
        prediction: BrainPrediction,
        context: MarketContext
    ): Promise<TradeIntent | null> {
        const brain = this.brains.get(prediction.brainType);

        if (!brain) {
            return null;
        }

        const intent = brain.proposeTradeIntent(prediction, context);

        if (intent) {
            console.log(`[Orchestrator] Trade intent proposed for ${prediction.symbol}`);
        } else {
            console.log(`[Orchestrator] Brain declined to propose trade for ${prediction.symbol}`);
        }

        return intent;
    }

    /**
     * Get brain by desk type
     */
    getBrain(desk: DeskType): SpecialistBrain | null {
        return this.brains.get(desk) || null;
    }

    /**
     * Check if orchestrator is ready (has at least one brain)
     */
    isReady(): boolean {
        return this.brains.size > 0;
    }
}

// Singleton instance
let orchestratorInstance: Orchestrator | null = null;

/**
 * Get the orchestrator singleton
 */
export function getOrchestrator(): Orchestrator {
    if (!orchestratorInstance) {
        orchestratorInstance = new Orchestrator();
    }
    return orchestratorInstance;
}
