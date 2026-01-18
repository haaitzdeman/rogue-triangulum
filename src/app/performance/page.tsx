'use client';

/**
 * Performance Page
 * 
 * Shows forecast accuracy and calibration metrics.
 */

import { PerformanceDashboard } from '@/components/dashboard/PerformanceDashboard';

export default function PerformancePage() {
    return (
        <div className="p-6">
            <h1 className="text-2xl font-bold text-white mb-6">Performance Dashboard</h1>

            <div className="bg-surface rounded-lg p-6">
                <PerformanceDashboard />
            </div>

            {/* Disclaimer */}
            <div className="mt-8 p-4 bg-yellow-900/20 border border-yellow-700/50 rounded-lg text-sm text-yellow-300/80">
                <strong>⚠️ Educational Tool</strong>: This is for personal use only.
                Trading involves substantial risk of loss. Past performance does not guarantee future results.
                This is not financial advice.
            </div>
        </div>
    );
}
