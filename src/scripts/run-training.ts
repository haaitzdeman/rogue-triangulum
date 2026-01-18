/**
 * Enhanced Meticulous Training Script
 * Runs 48-month day-by-day training with unlimited Polygon API
 * 
 * Usage: npx ts-node src/scripts/run-training.ts
 */

import { MeticulousLearningEngine } from '../lib/training/meticulous-engine';

async function runEnhancedTraining() {
    console.log('🚀 ENHANCED METICULOUS TRAINING');
    console.log('================================');
    console.log('Training Base: 6 months');
    console.log('Simulation Period: 48 months');
    console.log('Processing EACH DAY individually');
    console.log('================================\n');

    const engine = new MeticulousLearningEngine({
        symbols: ['AAPL', 'NVDA', 'TSLA', 'AMD', 'MSFT'],
        positionSize: 1000,
    });

    const session = await engine.learn(
        6,   // Training base: 6 months
        48,  // Simulation: 48 months (4 years of day-by-day learning)
        (record) => {
            // Print progress every 50 days
            if (record.day % 50 === 0) {
                console.log(`Day ${record.day}: ${record.tradesPlaced} trades, Win Rate: ${(record.cumulative.winRate * 100).toFixed(1)}%, P&L: $${record.cumulative.totalPnL.toFixed(2)}`);
            }
        },
        (day, total, winRate, pnl) => {
            // Progress callback
            if (day % 100 === 0) {
                console.log(`Progress: ${day}/${total} days (${((day / total) * 100).toFixed(0)}%)`);
            }
        }
    );

    console.log('\n================================');
    console.log('TRAINING COMPLETE');
    console.log('================================');
    console.log(`Total Days: ${session.totalDays}`);
    console.log(`Total Trades: ${session.totalTrades}`);
    console.log(`Win Rate: ${(session.winRate * 100).toFixed(1)}%`);
    console.log(`Total P&L: $${session.totalPnL.toFixed(2)}`);
    console.log('\nExpert Performance:');

    Object.entries(session.experts)
        .sort((a, b) => {
            const accA = a[1].trades > 0 ? a[1].correctPredictions / a[1].trades : 0;
            const accB = b[1].trades > 0 ? b[1].correctPredictions / b[1].trades : 0;
            return accB - accA;
        })
        .forEach(([name, exp]) => {
            const accuracy = exp.trades > 0 ? ((exp.correctPredictions / exp.trades) * 100).toFixed(1) : '0.0';
            console.log(`  ${name}: ${accuracy}% accuracy, ${exp.trades} trades, weight: ${(exp.weight * 100).toFixed(1)}%`);
        });
}

runEnhancedTraining().catch(console.error);
