/**
 * Broker Integration Types
 *
 * Normalized types for broker trade fills, Alpaca raw shapes, and sync results.
 * READ-ONLY integration — no order placement.
 */

// =============================================================================
// Normalized Fill
// =============================================================================

export interface BrokerFill {
    broker: 'alpaca';
    symbol: string;
    side: 'buy' | 'sell';
    qty: number;
    price: number;
    filledAt: string; // ISO-8601
    assetClass: 'stock' | 'option';

    // Option fields (present only when assetClass === 'option')
    underlyingSymbol?: string;
    expiration?: string;   // YYYY-MM-DD
    strike?: number;
    callPut?: 'call' | 'put';

    // Broker references
    orderId: string;
    tradeId: string;       // unique activity id from broker
}

// =============================================================================
// Alpaca Raw Shapes
// =============================================================================

/** Raw Alpaca trade activity (GET /v2/account/activities/FILL) */
export interface AlpacaActivity {
    id: string;
    activity_type: string;
    symbol: string;
    side: string;
    qty: string;
    price: string;
    cum_qty?: string;
    leaves_qty?: string;
    transaction_time: string;
    order_id: string;
    type?: string;
    order_status?: string;
}

/** Raw Alpaca order (GET /v2/orders) */
export interface AlpacaOrder {
    id: string;
    client_order_id: string;
    symbol: string;
    side: string;
    qty: string;
    filled_qty: string;
    filled_avg_price: string | null;
    status: string;
    type: string;
    time_in_force: string;
    created_at: string;
    updated_at: string;
    filled_at: string | null;
    asset_class: string;
    order_class?: string;
}

/** Minimal safe account response */
export interface AlpacaAccountSafe {
    id: string;
    status: string;
    currency: string;
}

// =============================================================================
// Sync Result
// =============================================================================

export interface SyncResult {
    success: boolean;
    fetchedCount: number;    // raw activities from Alpaca
    mappedCount: number;     // successfully mapped to BrokerFill
    insertedCount: number;   // newly inserted into DB
    skippedCount: number;    // deduped / skipped
    linkedCount: number;     // auto-linked to journal entries
    reconciledCount: number;  // auto-reconciled outcomes
    rangeUsed: { since: string; until: string };
    samplePreview: BrokerFill[]; // up to 10 fills for UI preview
    lastSyncedAt: string;    // ISO timestamp
    errorCode?: string;
    error?: string;
}
