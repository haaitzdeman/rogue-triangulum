/**
 * Coordinator Brain — Cross-Desk Ranking
 *
 * DO NOT change external response shapes or route paths.
 *
 * Owns the opportunity scoring and ranking logic that
 * cross-references outputs from premarket + options desks.
 * Reads cached data only — never imports decision layers directly.
 */

// Opportunity Engine
export {
    computeOpportunityScore,
    buildRankedOpportunity,
} from '@/lib/integration/opportunity-engine';

export type {
    Alignment,
    OpportunityScore,
    RankedOpportunity,
} from '@/lib/integration/opportunity-engine';
