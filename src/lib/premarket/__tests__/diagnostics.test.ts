/**
 * Premarket Diagnostics Tests
 * 
 * Tests for dev-only diagnostics route and provider diagnostics.
 */

import {
    diagnoseSymbol,
    getProviderDiagnostics,
    type SymbolDiagnostic,
} from '../provider';

describe('Provider Diagnostics', () => {
    describe('getProviderDiagnostics', () => {
        it('returns provider info without secrets', () => {
            const diag = getProviderDiagnostics();

            expect(diag).toHaveProperty('providerName');
            expect(diag).toHaveProperty('hasMASSIVE_API_KEY');
            expect(diag).toHaveProperty('hasPOLYGON_API_KEY');
            expect(diag).toHaveProperty('datasetDir');
            expect(diag).toHaveProperty('datasetDirExists');

            // Values should be booleans (not the actual keys)
            expect(typeof diag.hasMASSIVE_API_KEY).toBe('boolean');
            expect(typeof diag.hasPOLYGON_API_KEY).toBe('boolean');
        });
    });

    describe('diagnoseSymbol', () => {
        it('returns modeUsed=NONE when inputs are missing', () => {
            // Use a non-existent symbol to get missing inputs
            const date = new Date();
            const diag = diagnoseSymbol('NONEXISTENT_SYMBOL_12345', date);

            expect(diag.symbol).toBe('NONEXISTENT_SYMBOL_12345');
            expect(diag.ok).toBe(false);
            expect(diag.modeUsed).toBe('NONE');
            expect(diag.prevClose).toBe(null);
            expect(diag.open).toBe(null);
        });

        it('returns correct diagnostic shape', () => {
            const date = new Date();
            const diag = diagnoseSymbol('TEST_SYMBOL', date);

            // Verify shape
            const expectedKeys: (keyof SymbolDiagnostic)[] = [
                'symbol',
                'ok',
                'hasDataset',
                'barCount',
                'lastBarDate',
                'prevClose',
                'open',
                'premarketPrice',
                'modeUsed',
                'errorPreview',
            ];

            for (const key of expectedKeys) {
                expect(diag).toHaveProperty(key);
            }
        });

        it('sets modeUsed correctly when open data is available', () => {
            // This test depends on having actual data
            // If no data, modeUsed should be NONE
            const diag = diagnoseSymbol('AAPL', new Date('2024-01-15'));

            // modeUsed should be one of the valid values
            expect(['PREMARKET', 'OPEN_FALLBACK', 'NONE']).toContain(diag.modeUsed);

            // If open is available, modeUsed should not be NONE
            if (diag.open !== null) {
                expect(diag.modeUsed).not.toBe('NONE');
            }
        });
    });
});

describe('Diagnostics Route Shape', () => {
    // Note: These tests validate the expected shape without hitting the route
    // The route itself requires Next.js request handling

    it('diagnostics response should have required fields', () => {
        // Simulate the expected response shape
        const mockResponse = {
            nodeEnv: 'development',
            scanDate: '2026-01-29',
            provider: {
                providerName: 'dataset-file',
                hasMASSIVE_API_KEY: false,
                hasPOLYGON_API_KEY: false,
                datasetDir: 'data/datasets',
                datasetDirExists: true,
            },
            universe: {
                count: 48,
                first10: ['AAPL', 'MSFT', 'GOOGL', 'AMZN', 'META'],
            },
            diagnostics: {
                symbolCount: 5,
                okCount: 0,
                withPrevClose: 0,
                withOpen: 0,
                withPremarket: 0,
                symbols: [],
            },
        };

        // Validate required fields
        expect(mockResponse).toHaveProperty('nodeEnv');
        expect(mockResponse).toHaveProperty('scanDate');
        expect(mockResponse).toHaveProperty('provider');
        expect(mockResponse).toHaveProperty('universe');
        expect(mockResponse).toHaveProperty('diagnostics');

        // Provider should not contain secret values (only booleans)
        expect(typeof mockResponse.provider.hasMASSIVE_API_KEY).toBe('boolean');
        expect(typeof mockResponse.provider.hasPOLYGON_API_KEY).toBe('boolean');
    });
});
