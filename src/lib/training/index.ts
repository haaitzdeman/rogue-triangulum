/**
 * Training Module Index
 * 
 * REFACTORED: Fake learning removed. Only data providers remain.
 */

export {
    getTrainingProvider,
    setTrainingProvider,
    MockTrainingProvider,
} from './provider-adapter';

export type {
    TrainingProvider,
    OHLCVBar,
    Timeframe,
    OptionChainItem,
    MarketEvent,
} from './provider-adapter';

// Polygon real data provider
export { PolygonTrainingProvider } from './polygon-provider';
