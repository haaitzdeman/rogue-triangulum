/**
 * Brains Module Index
 */

// Interface
export * from './interface';

// Specialists
export { DayTradingBrain } from './specialists/day-trading-brain';
export { OptionsBrain } from './specialists/options-brain';
export { SwingBrain } from './specialists/swing-brain';
export { InvestingBrain } from './specialists/investing-brain';

// Smart brains (with real indicators)
export { SmartDayTradingBrain } from './specialists/smart-day-trading-brain';
