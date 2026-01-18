/**
 * Training Module Index
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

export {
    ReplayRunner,
    getReplayRunner,
} from './replay-runner';

export type {
    ReplayResult,
    ReplayConfig,
    CalibrationReport,
} from './replay-runner';

// Polygon real data provider
export { PolygonTrainingProvider } from './polygon-provider';

// Reinforcement learning
export {
    ReinforcementEngine,
    getReinforcementEngine,
} from './reinforcement-engine';

export type {
    EpisodeResult,
    ExpertStats,
    TrainingSession,
    LearningConfig,
} from './reinforcement-engine';

// Daily trade simulation
export {
    DailyTradeSimulator,
    getDailySimulator,
    resetDailySimulator,
} from './daily-simulator';

export type {
    TradeRecord,
    DailySummary,
    SimulationProgress,
    SimulationResults,
    SimulationConfig,
} from './daily-simulator';

// Smart simulation (with real indicators)
export {
    SmartDailySimulator,
    getSmartSimulator,
    resetSmartSimulator,
} from './smart-simulator';
