/**
 * Expert System Module Exports
 */

// Types
export * from './types';

// Base class
export { BaseExpert } from './base-expert';

// Individual experts
export { MomentumExpert } from './momentum-expert';
export { MeanReversionExpert } from './mean-reversion-expert';
export { BreakoutExpert } from './breakout-expert';
export { TrendFollowingExpert } from './trend-following-expert';

// Mixer
export { MHCMixer } from './mhc-mixer';

// Explanation
export {
    explainCandidate,
    quickExplain,
    formatContributions
} from './explanation-generator';
export type { Explanation } from './explanation-generator';

// Factory function to create a mixer with all default experts
import { MomentumExpert } from './momentum-expert';
import { MeanReversionExpert } from './mean-reversion-expert';
import { BreakoutExpert } from './breakout-expert';
import { TrendFollowingExpert } from './trend-following-expert';
import { MHCMixer } from './mhc-mixer';
import type { MixerConfig } from './types';

export function createDefaultMixer(config?: Partial<MixerConfig>): MHCMixer {
    const mixer = new MHCMixer(config);

    mixer.registerExperts([
        new MomentumExpert(),
        new MeanReversionExpert(),
        new BreakoutExpert(),
        new TrendFollowingExpert(),
    ]);

    return mixer;
}
