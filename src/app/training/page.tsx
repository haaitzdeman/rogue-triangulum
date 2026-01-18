'use client';

/**
 * Training Page - Removed (Fake Learning)
 * 
 * This page has been replaced with the Strategy Backtester at /learning.
 */

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

export default function TrainingPage() {
    const router = useRouter();

    useEffect(() => {
        router.replace('/learning');
    }, [router]);

    return (
        <div className="p-6 max-w-7xl mx-auto">
            <div className="bg-yellow-900/30 border border-yellow-700/50 rounded-lg p-6 text-center">
                <h1 className="text-xl font-bold text-yellow-300 mb-2">⚠️ Page Moved</h1>
                <p className="text-gray-400 mb-4">
                    Training has been replaced with the Strategy Backtester.
                </p>
                <p className="text-gray-400">
                    Redirecting...
                </p>
            </div>
        </div>
    );
}
