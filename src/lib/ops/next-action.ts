export interface NextActionInstruction {
    nextAction: string;
    why: string;
    requiredHumanAction: string | null;
    suggestedEndpointToRun: string | null;
}

export interface ComputeNextActionParams {
    marketClock: {
        isMarketOpen: boolean;
        isExtendedHours: boolean;
        nextOpenET: string;
    };
    unlockOk: boolean;
    degradedFlags?: string[];
}

/**
 * Pure function to determine the exact single NextAction for the operator.
 * Explicitly rules out drift by consuming market clock and unlock state.
 */
export function computeNextAction(params: ComputeNextActionParams): NextActionInstruction {
    // 1. Degraded flags take highest priority if supplied
    if (params.degradedFlags && params.degradedFlags.length > 0) {
        return {
            nextAction: 'INVESTIGATE_DEGRADED',
            why: `System has degraded flags: ${params.degradedFlags.join(', ')}`,
            requiredHumanAction: 'Investigate errors in job-run-store or daily checks.',
            suggestedEndpointToRun: '/api/dev/health'
        };
    }

    // 2. Unlock lock logic
    if (!params.unlockOk) {
        if (!params.marketClock.isMarketOpen && !params.marketClock.isExtendedHours) {
            return {
                nextAction: 'WAIT_FOR_MARKET_OPEN',
                why: `Market is closed. First trade cannot be placed. Next open: ${params.marketClock.nextOpenET}`,
                requiredHumanAction: 'Wait for market hours.',
                suggestedEndpointToRun: null
            };
        } else {
            return {
                nextAction: 'WAITING_FOR_FIRST_TRADE',
                why: 'System needs a complete paper trade lifecycle (buy, sync, sell, sync).',
                requiredHumanAction: 'Buy 1 share -> run sync -> sell -> run sync',
                suggestedEndpointToRun: '/api/dev/smoke/guided-first-trade'
            };
        }
    }

    // 3. Operational
    return {
        nextAction: 'SYSTEM_OPERATIONAL',
        why: 'First trade unlock is passed and no degraded flags detected.',
        requiredHumanAction: null,
        suggestedEndpointToRun: null
    };
}
