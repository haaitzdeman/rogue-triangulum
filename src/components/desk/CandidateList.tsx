"use client";

import { ExclamationTriangleIcon, ArrowRightIcon } from "@heroicons/react/24/outline";

interface Candidate {
    id: string;
    symbol: string;
    name: string;
    setupType: string;
    score: number;
    confidence: number;
    priceChange: number;
    invalidation: number;
    reasons: string[];
}

interface CandidateListProps {
    candidates: Candidate[];
    deskType?: string;
}

function getScoreColor(score: number): string {
    if (score >= 75) return "text-bullish";
    if (score >= 50) return "text-caution";
    return "text-bearish";
}

function getConfidenceColor(confidence: number): string {
    if (confidence >= 0.7) return "bg-bullish";
    if (confidence >= 0.5) return "bg-caution";
    return "bg-bearish";
}

export function CandidateList({ candidates, deskType: _deskType }: CandidateListProps) {
    return (
        <div className="space-y-4">
            <div className="flex items-center justify-between">
                <h2 className="text-sm font-medium">Ranked Candidates</h2>
                <span className="text-xs text-foreground-muted">{candidates.length} setups</span>
            </div>

            <div className="space-y-3">
                {candidates.map((candidate, index) => (
                    <div
                        key={candidate.id}
                        className="card-interactive p-4"
                    >
                        {/* Header Row */}
                        <div className="flex items-start justify-between mb-3">
                            <div className="flex items-center gap-3">
                                <span className="text-sm text-foreground-muted">#{index + 1}</span>
                                <div>
                                    <div className="flex items-center gap-2">
                                        <span className="font-mono font-bold text-lg">{candidate.symbol}</span>
                                        <span className="badge badge-neutral text-2xs">{candidate.setupType}</span>
                                    </div>
                                    <span className="text-xs text-foreground-muted">{candidate.name}</span>
                                </div>
                            </div>

                            <div className="text-right">
                                <div className={`score-display ${getScoreColor(candidate.score)}`}>
                                    {candidate.score}
                                </div>
                                <div className="flex items-center gap-1 mt-1">
                                    <span className="text-2xs text-foreground-muted">Conf:</span>
                                    <div className="w-12 h-1.5 rounded-full bg-background-tertiary overflow-hidden">
                                        <div
                                            className={`h-full rounded-full ${getConfidenceColor(candidate.confidence)}`}
                                            style={{ width: `${candidate.confidence * 100}%` }}
                                        />
                                    </div>
                                    <span className="text-2xs font-mono">{(candidate.confidence * 100).toFixed(0)}%</span>
                                </div>
                            </div>
                        </div>

                        {/* Price Change */}
                        <div className="flex items-center gap-4 mb-3 text-sm">
                            <span className={candidate.priceChange >= 0 ? "price-positive" : "price-negative"}>
                                {candidate.priceChange >= 0 ? "+" : ""}{candidate.priceChange.toFixed(2)}%
                            </span>
                        </div>

                        {/* Reasons */}
                        <div className="flex flex-wrap gap-2 mb-3">
                            {candidate.reasons.map((reason, i) => (
                                <span key={i} className="text-xs px-2 py-0.5 rounded bg-accent/10 text-accent">
                                    {reason}
                                </span>
                            ))}
                        </div>

                        {/* Invalidation Box */}
                        <div className="flex items-center gap-2 p-2 rounded bg-bearish/10 border border-bearish/20">
                            <ExclamationTriangleIcon className="w-4 h-4 text-bearish flex-shrink-0" />
                            <span className="text-xs text-bearish">
                                Invalidation: <span className="font-mono">${candidate.invalidation.toFixed(2)}</span>
                            </span>
                        </div>

                        {/* View Dossier */}
                        <button className="flex items-center justify-end gap-1 w-full mt-3 text-xs text-foreground-muted hover:text-accent transition-colors">
                            View Dossier <ArrowRightIcon className="w-3 h-3" />
                        </button>
                    </div>
                ))}
            </div>
        </div>
    );
}
