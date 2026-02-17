/**
 * Options Signal Utils
 *
 * Deterministic signal ID generation for options journal entries.
 * Reuses same pattern as premarket/signal-utils.ts (SHA-256 hash).
 *
 * Signal ID = hash(date + symbol + strategySuggestion + ivRank)
 */

import * as crypto from 'crypto';

/**
 * Generate a deterministic signal ID for an options scan.
 * Hash of: date + symbol + strategy + IV rank value.
 *
 * This allows detecting duplicate entries across scans.
 */
export function generateOptionsSignalId(
    date: string,
    symbol: string,
    strategySuggestion: string,
    ivRankValue: number | null,
): string {
    const normalizedIV = ivRankValue !== null ? ivRankValue.toFixed(4) : 'null';
    const input = `${date}|${symbol.toUpperCase()}|${strategySuggestion}|${normalizedIV}`;

    const hash = crypto.createHash('sha256').update(input).digest('hex');
    return hash.slice(0, 16);
}
