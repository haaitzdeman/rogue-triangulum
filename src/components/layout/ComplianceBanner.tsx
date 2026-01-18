"use client";

import { useState } from "react";
import { XMarkIcon, ExclamationTriangleIcon } from "@heroicons/react/24/outline";

export function ComplianceBanner() {
    const [dismissed, setDismissed] = useState(false);
    const [minimized, setMinimized] = useState(false);

    if (dismissed) {
        return null;
    }

    return (
        <div className="compliance-banner flex items-center justify-between gap-4">
            <div className="flex items-center gap-2">
                <ExclamationTriangleIcon className="w-4 h-4 flex-shrink-0" />
                {minimized ? (
                    <button
                        onClick={() => setMinimized(false)}
                        className="hover:underline"
                    >
                        Educational Tool Disclaimer
                    </button>
                ) : (
                    <span>
                        <strong>Educational Tool Only.</strong> Not financial advice. Trading involves substantial risk of loss.
                        Past performance does not guarantee future results. Always do your own research.
                    </span>
                )}
            </div>

            <div className="flex items-center gap-2">
                {!minimized && (
                    <button
                        onClick={() => setMinimized(true)}
                        className="text-2xs hover:underline"
                    >
                        Minimize
                    </button>
                )}
                <button
                    onClick={() => setDismissed(true)}
                    className="p-1 hover:bg-caution/20 rounded"
                    aria-label="Dismiss disclaimer"
                >
                    <XMarkIcon className="w-4 h-4" />
                </button>
            </div>
        </div>
    );
}
