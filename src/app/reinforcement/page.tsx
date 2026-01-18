'use client';

/**
 * Reinforcement Page - Removed (Fake Learning)
 * 
 * This page has been replaced with the Strategy Backtester.
 * Rule-based strategies with forecast tracking - no fake learning.
 */

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

export default function ReinforcementPage() {
    const router = useRouter();

    useEffect(() => {
        router.replace('/learning');
    }, [router]);

    return (
        <div className="p-6 max-w-7xl mx-auto">
            <div className="bg-yellow-900/30 border border-yellow-700/50 rounded-lg p-6 text-center">
                <h1 className="text-xl font-bold text-yellow-300 mb-2">⚠️ Page Removed</h1>
                <p className="text-gray-400 mb-4">
                    The reinforcement learning system has been removed as it did not produce real learning.
                </p>
                <p className="text-gray-400">
                    Redirecting to Strategy Backtester...
                </p>
            </div>
        </div>
    );
}
