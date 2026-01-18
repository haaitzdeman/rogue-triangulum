'use client';

/**
 * Simulation Page - Redirects to Backtester
 * 
 * The old simulation system has been replaced with the Strategy Backtester.
 */

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

export default function SimulationPage() {
    const router = useRouter();

    useEffect(() => {
        router.replace('/learning');
    }, [router]);

    return (
        <div className="p-6 max-w-7xl mx-auto">
            <p className="text-gray-400">Redirecting to Strategy Backtester...</p>
        </div>
    );
}
