/**
 * What This Means - Beginner-Friendly Explanation Component
 * 
 * Accordion component explaining trading concepts in simple terms.
 * UI naming: "Calibration" not "Training"
 */

'use client';

import { useState } from 'react';
import { ChevronDownIcon, ChevronUpIcon } from '@heroicons/react/24/outline';

interface WhatThisMeansProps {
    type: 'score' | 'confidence' | 'regime' | 'stoptarget' | 'calibration' | 'all';
    className?: string;
}

const EXPLANATIONS = {
    score: {
        title: 'What is the Score?',
        simple: 'The score tells you how strong a trading signal is, from 0-100. Higher = stronger signal.',
        details: `
            The score combines multiple factors:
            • Technical indicators (RSI, moving averages)
            • Price momentum and trend strength
            • Volume confirmation
            
            A score of 80+ is considered high-conviction.
            A score below 50 is generally too weak to trade.
        `,
    },
    confidence: {
        title: 'What is Confidence?',
        simple: 'Confidence shows how reliable this signal has been historically. Higher = more reliable.',
        details: `
            Confidence is based on walk-forward backtesting:
            • We tested similar signals on past data
            • Confidence = historical win rate for this signal type
            
            Important: Past performance does not guarantee future results.
        `,
    },
    regime: {
        title: 'What is Market Regime?',
        simple: 'Regime describes current market conditions: calm, normal, or volatile.',
        details: `
            We detect three regimes:
            • Low Volatility: Calm market, smaller moves expected
            • Normal: Typical market conditions
            • High Volatility: Wild swings, larger stops needed
            
            Strategy weights adjust based on regime performance.
        `,
    },
    stoptarget: {
        title: 'Stop Loss & Target',
        simple: 'Stop = where to exit if wrong. Target = where to exit if right.',
        details: `
            These levels are calculated from volatility (ATR):
            • Stop: Usually 1-2x daily volatility below entry
            • Target: Usually 2-3x daily volatility above entry
            
            Risk/Reward ratio should be at least 2:1.
            Never move your stop further away from entry.
        `,
    },
    calibration: {
        title: 'How Does Calibration Work?',
        simple: 'We test strategies on past data to adjust their weights based on real performance.',
        details: `
            Walk-forward calibration process:
            1. Split 5 years of data into training/testing windows
            2. Measure win rate and returns for each strategy
            3. Assign weights: better performers get higher weight
            4. Repeat across multiple time periods
            
            This is NOT AI or machine learning. It's performance-based adjustment.
            The calibration profile updates only when you run it manually.
        `,
    },
};

const WARNINGS = [
    '⚠️ Past performance does NOT guarantee future results',
    '⚠️ Data is 15-minutes delayed (Massive Stocks Starter plan)',
    '⚠️ Paper trading first — validate before using real money',
    '⚠️ Position sizing matters — never risk more than 2% per trade',
];

export function WhatThisMeans({ type, className = '' }: WhatThisMeansProps) {
    const [isOpen, setIsOpen] = useState(false);

    const items = type === 'all'
        ? Object.entries(EXPLANATIONS)
        : [[type, EXPLANATIONS[type]]];

    return (
        <div className={`rounded-lg border border-slate-700 bg-slate-800/50 ${className}`}>
            <button
                onClick={() => setIsOpen(!isOpen)}
                className="w-full flex items-center justify-between px-4 py-3 text-left hover:bg-slate-700/30 transition-colors"
            >
                <span className="text-sm font-medium text-slate-300">
                    💡 What This Means
                </span>
                {isOpen ? (
                    <ChevronUpIcon className="w-4 h-4 text-slate-400" />
                ) : (
                    <ChevronDownIcon className="w-4 h-4 text-slate-400" />
                )}
            </button>

            {isOpen && (
                <div className="px-4 pb-4 space-y-4">
                    {items.map(([key, explanation]) => (
                        <ExplanationItem
                            key={String(key)}
                            title={(explanation as typeof EXPLANATIONS.score).title}
                            simple={(explanation as typeof EXPLANATIONS.score).simple}
                            details={(explanation as typeof EXPLANATIONS.score).details}
                        />
                    ))}

                    {/* Warnings */}
                    <div className="mt-4 p-3 rounded-lg bg-amber-900/20 border border-amber-700/50">
                        <h4 className="text-xs font-semibold text-amber-400 mb-2">
                            IMPORTANT WARNINGS
                        </h4>
                        <ul className="space-y-1">
                            {WARNINGS.map((warning, i) => (
                                <li key={i} className="text-xs text-amber-300/80">
                                    {warning}
                                </li>
                            ))}
                        </ul>
                    </div>
                </div>
            )}
        </div>
    );
}

function ExplanationItem({
    title,
    simple,
    details
}: {
    title: string;
    simple: string;
    details: string;
}) {
    const [showDetails, setShowDetails] = useState(false);

    return (
        <div className="border-l-2 border-blue-500/50 pl-3">
            <h4 className="text-sm font-medium text-slate-200 mb-1">{title}</h4>
            <p className="text-xs text-slate-400 leading-relaxed">{simple}</p>

            {details && (
                <>
                    <button
                        onClick={() => setShowDetails(!showDetails)}
                        className="text-xs text-blue-400 hover:text-blue-300 mt-1"
                    >
                        {showDetails ? 'Hide details' : 'Learn more'}
                    </button>

                    {showDetails && (
                        <pre className="mt-2 text-xs text-slate-500 whitespace-pre-wrap font-sans">
                            {details.trim()}
                        </pre>
                    )}
                </>
            )}
        </div>
    );
}

/**
 * Score Explanation Badge - Inline explanation for scores
 */
export function ScoreExplanationBadge({
    baseScore,
    strategyWeight,
    calibrationFactor,
    finalScore,
}: {
    baseScore: number;
    strategyWeight: number;
    calibrationFactor: number;
    finalScore: number;
}) {
    const [isOpen, setIsOpen] = useState(false);

    return (
        <div className="relative">
            <button
                onClick={() => setIsOpen(!isOpen)}
                className="text-xs text-slate-400 hover:text-slate-300 underline decoration-dotted"
            >
                How is this calculated?
            </button>

            {isOpen && (
                <div className="absolute top-full left-0 mt-1 p-3 rounded-lg bg-slate-800 border border-slate-600 shadow-xl z-50 min-w-[280px]">
                    <h4 className="text-xs font-semibold text-slate-300 mb-2">
                        Score Calculation
                    </h4>

                    <div className="space-y-2 text-xs">
                        <div className="flex justify-between">
                            <span className="text-slate-400">Base Score (from strategy)</span>
                            <span className="text-slate-200 font-mono">{baseScore}</span>
                        </div>
                        <div className="flex justify-between">
                            <span className="text-slate-400">× Strategy Weight (regime)</span>
                            <span className="text-slate-200 font-mono">{strategyWeight.toFixed(2)}x</span>
                        </div>
                        <div className="flex justify-between">
                            <span className="text-slate-400">× Calibration Factor</span>
                            <span className="text-slate-200 font-mono">{calibrationFactor.toFixed(2)}x</span>
                        </div>
                        <div className="border-t border-slate-600 pt-2 flex justify-between font-medium">
                            <span className="text-slate-300">= Final Score</span>
                            <span className="text-green-400 font-mono">{finalScore}</span>
                        </div>
                    </div>

                    <p className="mt-3 text-[10px] text-slate-500">
                        Weights based on walk-forward backtesting over 5 years of data.
                    </p>

                    <button
                        onClick={() => setIsOpen(false)}
                        className="mt-2 text-xs text-slate-400 hover:text-slate-300"
                    >
                        Close
                    </button>
                </div>
            )}
        </div>
    );
}
