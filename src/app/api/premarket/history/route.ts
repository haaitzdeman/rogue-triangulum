export const dynamic = 'force-dynamic';

/**
 * Premarket History API Route
 * 
 * GET /api/premarket/history
 * 
 * Returns list of available saved scan dates from data/premarket/*.json
 * with summary info (candidateCount, generatedAt, mode).
 */

import { NextResponse } from 'next/server';
import * as fs from 'fs';
import * as path from 'path';

const PREMARKET_DIR = 'data/premarket';

interface HistoryEntry {
    date: string;
    candidateCount: number;
    generatedAt: string;
    mode: string;
    effectiveDate: string;
}

export async function GET() {
    try {
        // Check if directory exists
        if (!fs.existsSync(PREMARKET_DIR)) {
            return NextResponse.json({
                success: true,
                history: [],
                count: 0,
            });
        }

        // Read all JSON files
        const files = fs.readdirSync(PREMARKET_DIR)
            .filter(f => f.endsWith('.json'))
            .sort()
            .reverse(); // Newest first

        const history: HistoryEntry[] = [];

        for (const file of files) {
            try {
                const filepath = path.join(PREMARKET_DIR, file);
                const content = fs.readFileSync(filepath, 'utf-8');
                const data = JSON.parse(content);

                history.push({
                    date: file.replace('.json', ''),
                    candidateCount: data.candidateCount ?? 0,
                    generatedAt: data.generatedAt ?? 'unknown',
                    mode: data.resolved?.mode ?? 'DATASET_REPLAY',
                    effectiveDate: data.resolved?.effectiveDate ?? data.date ?? file.replace('.json', ''),
                });
            } catch {
                // Skip malformed files
                console.warn(`[History API] Skipping malformed file: ${file}`);
            }
        }

        return NextResponse.json({
            success: true,
            history,
            count: history.length,
        });
    } catch (error) {
        console.error('[History API] Error:', error);
        return NextResponse.json(
            {
                success: false,
                errorCode: 'INTERNAL_ERROR',
                message: error instanceof Error ? error.message : 'Unknown error',
            },
            { status: 500 }
        );
    }
}
