/**
 * Journal Hooks
 * 
 * React hooks for managing journal entries with Supabase.
 */

'use client';

import { useState, useCallback, useEffect } from 'react';
import { supabase, isSupabaseConfigured } from '../supabase/client';
import type {
    JournalEntry,
    EntryType,
    MistakeCategory,
    TradeStats
} from './types';
import type { DeskType } from '../experts/types';

// Convert DB row to JournalEntry
function rowToEntry(row: Record<string, unknown>): JournalEntry {
    return {
        id: row.id as string,
        createdAt: new Date(row.created_at as string),
        updatedAt: new Date(row.updated_at as string),
        symbol: row.symbol as string,
        deskType: row.desk_type as DeskType,
        entryType: row.entry_type as EntryType,
        setupType: row.setup_type as JournalEntry['setupType'],
        entryPrice: row.entry_price as number | undefined,
        exitPrice: row.exit_price as number | undefined,
        positionSize: row.position_size as number | undefined,
        pnl: row.pnl as number | undefined,
        pnlPercent: row.pnl_percent as number | undefined,
        notes: row.notes as string,
        lessonsLearned: row.lessons_learned as string | undefined,
        mistakes: (row.mistake_category ? [row.mistake_category] : []) as MistakeCategory[],
        screenshotUrls: (row.screenshot_urls || []) as string[],
        tags: (row.tags || []) as string[],
    };
}

// Hook for journal entries
export function useJournal(deskType?: DeskType) {
    const [entries, setEntries] = useState<JournalEntry[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    // Fetch entries
    const fetchEntries = useCallback(async () => {
        if (!isSupabaseConfigured()) {
            setLoading(false);
            return;
        }

        setLoading(true);
        setError(null);

        try {
            let query = supabase
                .from('journal_entries')
                .select('*')
                .order('created_at', { ascending: false })
                .limit(100);

            if (deskType) {
                query = query.eq('desk_type', deskType);
            }

            const { data, error: fetchError } = await query;

            if (fetchError) throw fetchError;

            const mappedEntries = (data || []).map(row => rowToEntry(row as Record<string, unknown>));
            setEntries(mappedEntries);
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Failed to fetch entries');
        } finally {
            setLoading(false);
        }
    }, [deskType]);

    // Create entry
    const createEntry = useCallback(async (entry: Omit<JournalEntry, 'id' | 'createdAt' | 'updatedAt'>) => {
        if (!isSupabaseConfigured()) {
            throw new Error('Supabase not configured');
        }

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { data, error: insertError } = await (supabase.from('journal_entries') as any)
            .insert({
                symbol: entry.symbol,
                entry_type: entry.entryType,
                desk_type: entry.deskType,
                setup_type: entry.setupType,
                entry_price: entry.entryPrice,
                exit_price: entry.exitPrice,
                position_size: entry.positionSize,
                pnl: entry.pnl,
                pnl_percent: entry.pnlPercent,
                notes: entry.notes,
                lessons_learned: entry.lessonsLearned,
                mistake_category: entry.mistakes[0] || null,
                screenshot_urls: entry.screenshotUrls,
                tags: entry.tags,
            })
            .select()
            .single();

        if (insertError) throw insertError;

        const newEntry = rowToEntry(data as Record<string, unknown>);
        setEntries(prev => [newEntry, ...prev]);
        return newEntry;
    }, []);

    // Update entry
    const updateEntry = useCallback(async (id: string, updates: Partial<JournalEntry>) => {
        if (!isSupabaseConfigured()) {
            throw new Error('Supabase not configured');
        }

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { error: updateError } = await (supabase.from('journal_entries') as any)
            .update({
                symbol: updates.symbol,
                entry_type: updates.entryType,
                desk_type: updates.deskType,
                setup_type: updates.setupType,
                entry_price: updates.entryPrice,
                exit_price: updates.exitPrice,
                position_size: updates.positionSize,
                pnl: updates.pnl,
                pnl_percent: updates.pnlPercent,
                notes: updates.notes,
                lessons_learned: updates.lessonsLearned,
                mistake_category: updates.mistakes?.[0] || null,
                screenshot_urls: updates.screenshotUrls,
                tags: updates.tags,
            })
            .eq('id', id);

        if (updateError) throw updateError;

        setEntries(prev => prev.map(e => e.id === id ? { ...e, ...updates } : e));
    }, []);

    // Delete entry
    const deleteEntry = useCallback(async (id: string) => {
        if (!isSupabaseConfigured()) {
            throw new Error('Supabase not configured');
        }

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { error: deleteError } = await (supabase.from('journal_entries') as any)
            .delete()
            .eq('id', id);

        if (deleteError) throw deleteError;

        setEntries(prev => prev.filter(e => e.id !== id));
    }, []);

    // Initial fetch
    useEffect(() => {
        fetchEntries();
    }, [fetchEntries]);

    return {
        entries,
        loading,
        error,
        createEntry,
        updateEntry,
        deleteEntry,
        refetch: fetchEntries,
    };
}

// Hook for trade statistics
export function useTradeStats(deskType?: DeskType): TradeStats | null {
    const { entries } = useJournal(deskType);

    if (entries.length === 0) return null;

    // Filter to trades only
    const trades = entries.filter(e => e.entryType === 'trade' && e.pnl !== undefined);

    if (trades.length === 0) return null;

    const wins = trades.filter(t => (t.pnl || 0) > 0);
    const losses = trades.filter(t => (t.pnl || 0) < 0);

    const totalPnl = trades.reduce((sum, t) => sum + (t.pnl || 0), 0);
    const winAmount = wins.reduce((sum, t) => sum + (t.pnl || 0), 0);
    const lossAmount = Math.abs(losses.reduce((sum, t) => sum + (t.pnl || 0), 0));

    // Compute stats
    return {
        totalTrades: trades.length,
        wins: wins.length,
        losses: losses.length,
        winRate: trades.length > 0 ? wins.length / trades.length : 0,
        avgWin: wins.length > 0 ? winAmount / wins.length : 0,
        avgLoss: losses.length > 0 ? lossAmount / losses.length : 0,
        profitFactor: lossAmount > 0 ? winAmount / lossAmount : winAmount > 0 ? Infinity : 0,
        largestWin: Math.max(...wins.map(t => t.pnl || 0), 0),
        largestLoss: Math.abs(Math.min(...losses.map(t => t.pnl || 0), 0)),
        avgRMultiple: 0, // Would need R calculation
        expectancy: trades.length > 0 ? totalPnl / trades.length : 0,
        byDesk: {} as TradeStats['byDesk'],
        bySetup: {} as TradeStats['bySetup'],
        topMistakes: [],
    };
}
