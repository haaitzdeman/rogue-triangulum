/**
 * Supabase Database Types
 * 
 * TypeScript types generated from our database schema.
 * Covers: watchlists, journal entries, trades, expert calibration.
 */

export type Json =
    | string
    | number
    | boolean
    | null
    | { [key: string]: Json | undefined }
    | Json[];

export interface Database {
    public: {
        Tables: {
            // Watchlist items
            watchlist: {
                Row: {
                    id: string;
                    symbol: string;
                    name: string;
                    added_at: string;
                    notes: string | null;
                    desk_type: string;
                    price_target: number | null;
                    stop_loss: number | null;
                    alert_enabled: boolean;
                    tags: string[];
                };
                Insert: {
                    id?: string;
                    symbol: string;
                    name: string;
                    added_at?: string;
                    notes?: string | null;
                    desk_type?: string;
                    price_target?: number | null;
                    stop_loss?: number | null;
                    alert_enabled?: boolean;
                    tags?: string[];
                };
                Update: {
                    id?: string;
                    symbol?: string;
                    name?: string;
                    added_at?: string;
                    notes?: string | null;
                    desk_type?: string;
                    price_target?: number | null;
                    stop_loss?: number | null;
                    alert_enabled?: boolean;
                    tags?: string[];
                };
            };

            // Journal entries
            journal_entries: {
                Row: {
                    id: string;
                    created_at: string;
                    updated_at: string;
                    symbol: string;
                    entry_type: 'trade' | 'observation' | 'lesson' | 'mistake';
                    desk_type: string;
                    setup_type: string | null;
                    entry_price: number | null;
                    exit_price: number | null;
                    position_size: number | null;
                    pnl: number | null;
                    pnl_percent: number | null;
                    notes: string;
                    lessons_learned: string | null;
                    mistake_category: string | null;
                    screenshot_urls: string[];
                    tags: string[];
                };
                Insert: {
                    id?: string;
                    created_at?: string;
                    updated_at?: string;
                    symbol: string;
                    entry_type: 'trade' | 'observation' | 'lesson' | 'mistake';
                    desk_type: string;
                    setup_type?: string | null;
                    entry_price?: number | null;
                    exit_price?: number | null;
                    position_size?: number | null;
                    pnl?: number | null;
                    pnl_percent?: number | null;
                    notes: string;
                    lessons_learned?: string | null;
                    mistake_category?: string | null;
                    screenshot_urls?: string[];
                    tags?: string[];
                };
                Update: {
                    id?: string;
                    created_at?: string;
                    updated_at?: string;
                    symbol?: string;
                    entry_type?: 'trade' | 'observation' | 'lesson' | 'mistake';
                    desk_type?: string;
                    setup_type?: string | null;
                    entry_price?: number | null;
                    exit_price?: number | null;
                    position_size?: number | null;
                    pnl?: number | null;
                    pnl_percent?: number | null;
                    notes?: string;
                    lessons_learned?: string | null;
                    mistake_category?: string | null;
                    screenshot_urls?: string[];
                    tags?: string[];
                };
            };

            // Expert calibration data
            expert_calibration: {
                Row: {
                    id: string;
                    expert_name: string;
                    desk_type: string;
                    weight: number;
                    accuracy_30d: number | null;
                    total_signals: number;
                    correct_signals: number;
                    last_calibrated: string;
                    created_at: string;
                };
                Insert: {
                    id?: string;
                    expert_name: string;
                    desk_type: string;
                    weight?: number;
                    accuracy_30d?: number | null;
                    total_signals?: number;
                    correct_signals?: number;
                    last_calibrated?: string;
                    created_at?: string;
                };
                Update: {
                    id?: string;
                    expert_name?: string;
                    desk_type?: string;
                    weight?: number;
                    accuracy_30d?: number | null;
                    total_signals?: number;
                    correct_signals?: number;
                    last_calibrated?: string;
                    created_at?: string;
                };
            };

            // Cached market data
            market_data_cache: {
                Row: {
                    id: string;
                    cache_key: string;
                    data: Json;
                    expires_at: string;
                    created_at: string;
                };
                Insert: {
                    id?: string;
                    cache_key: string;
                    data: Json;
                    expires_at: string;
                    created_at?: string;
                };
                Update: {
                    id?: string;
                    cache_key?: string;
                    data?: Json;
                    expires_at?: string;
                    created_at?: string;
                };
            };
        };
        Views: {
            [_ in never]: never;
        };
        Functions: {
            [_ in never]: never;
        };
        Enums: {
            desk_type: 'day-trading' | 'options' | 'swing' | 'investing';
            entry_type: 'trade' | 'observation' | 'lesson' | 'mistake';
        };
    };
}

// Export table row types for convenience
export type Watchlist = Database['public']['Tables']['watchlist']['Row'];
export type JournalEntry = Database['public']['Tables']['journal_entries']['Row'];
export type ExpertCalibration = Database['public']['Tables']['expert_calibration']['Row'];
export type MarketDataCache = Database['public']['Tables']['market_data_cache']['Row'];
