/**
 * Paper Execution Store
 * 
 * Server-side only JSON file store for paper executions.
 * WARNING: This is for dev/self-host only - NOT for serverless deployment.
 * 
 * IMPORTANT: Only PaperBroker should import this.
 */

import fs from 'fs';
import path from 'path';
import type { PaperExecution, PaperExecutionStore } from './execution-types';

// Store file location
const DATA_DIR = path.join(process.cwd(), 'data');
const STORE_FILE = path.join(DATA_DIR, 'paper-executions.json');

/**
 * Initialize empty store
 */
function createEmptyStore(): PaperExecutionStore {
    return {
        executions: [],
        lastUpdated: new Date().toISOString(),
        version: 'V1',
    };
}

/**
 * Ensure data directory exists
 */
function ensureDataDir(): void {
    if (!fs.existsSync(DATA_DIR)) {
        fs.mkdirSync(DATA_DIR, { recursive: true });
    }
}

/**
 * Read store from disk
 */
export function readExecutionStore(): PaperExecutionStore {
    ensureDataDir();

    if (!fs.existsSync(STORE_FILE)) {
        const empty = createEmptyStore();
        writeExecutionStore(empty);
        return empty;
    }

    try {
        const data = fs.readFileSync(STORE_FILE, 'utf-8');
        const store = JSON.parse(data) as PaperExecutionStore;
        return store;
    } catch (error) {
        console.error('[PaperStore] Error reading store:', error);
        return createEmptyStore();
    }
}

/**
 * Write store to disk
 */
export function writeExecutionStore(store: PaperExecutionStore): void {
    ensureDataDir();

    store.lastUpdated = new Date().toISOString();

    try {
        fs.writeFileSync(STORE_FILE, JSON.stringify(store, null, 2), 'utf-8');
    } catch (error) {
        console.error('[PaperStore] Error writing store:', error);
        throw error;
    }
}

/**
 * Add an execution to the store
 */
export function addExecution(execution: PaperExecution): void {
    const store = readExecutionStore();
    store.executions.push(execution);
    writeExecutionStore(store);
    console.log(`[PaperStore] Recorded execution: ${execution.symbol} ${execution.side} ${execution.quantity} @ ${execution.fillPrice}`);
}

/**
 * Get all executions
 */
export function getExecutions(): PaperExecution[] {
    const store = readExecutionStore();
    return store.executions;
}

/**
 * Get executions by symbol
 */
export function getExecutionsBySymbol(symbol: string): PaperExecution[] {
    const store = readExecutionStore();
    return store.executions.filter(e => e.symbol === symbol);
}
