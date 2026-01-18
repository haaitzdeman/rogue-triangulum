"use client";

import { ChevronDownIcon, ChevronUpIcon, LightBulbIcon, ExclamationTriangleIcon } from "@heroicons/react/24/outline";
import { useState } from "react";
import { useBeginnerMode } from "@/components/providers/BeginnerModeProvider";

interface Term {
    term: string;
    definition: string;
}

interface BeginnerContent {
    title: string;
    description: string;
    terms: Term[];
    warning: string;
}

interface BeginnerPanelProps {
    content: BeginnerContent;
}

export function BeginnerPanel({ content }: BeginnerPanelProps) {
    const { beginnerMode } = useBeginnerMode();
    const [expanded, setExpanded] = useState(true);

    if (!beginnerMode) {
        return null;
    }

    return (
        <div className="explain-panel">
            <button
                onClick={() => setExpanded(!expanded)}
                className="flex items-center justify-between w-full text-left"
            >
                <div className="flex items-center gap-2">
                    <LightBulbIcon className="w-5 h-5 text-accent" />
                    <span className="font-medium text-accent">Explain Like I&apos;m New</span>
                </div>
                {expanded ? (
                    <ChevronUpIcon className="w-4 h-4 text-foreground-muted" />
                ) : (
                    <ChevronDownIcon className="w-4 h-4 text-foreground-muted" />
                )}
            </button>

            {expanded && (
                <div className="mt-4 space-y-4">
                    {/* Description */}
                    <p className="text-sm text-foreground-muted">{content.description}</p>

                    {/* Key Terms */}
                    <div className="space-y-2">
                        <h4 className="text-xs font-medium uppercase tracking-wide text-foreground-muted">
                            Key Terms
                        </h4>
                        {content.terms.map((term) => (
                            <div key={term.term} className="text-sm">
                                <span className="explain-term">{term.term}</span>
                                <span className="text-foreground-muted"> — {term.definition}</span>
                            </div>
                        ))}
                    </div>

                    {/* Warning */}
                    <div className="flex items-start gap-2 p-3 rounded-lg bg-caution/10 border border-caution/30">
                        <ExclamationTriangleIcon className="w-4 h-4 text-caution flex-shrink-0 mt-0.5" />
                        <span className="text-xs text-caution">{content.warning}</span>
                    </div>
                </div>
            )}
        </div>
    );
}
