/**
 * Health Aggregator Route Tests
 *
 * Tests the /api/dev/health endpoint:
 * 1. PASS when all subsystems pass
 * 2. FAIL when any subsystem fails
 */

import { NextRequest, NextResponse } from 'next/server';

// ---------------------------------------------------------------------------
// Mock sub-route modules using @/ alias paths (matches static imports
// in the health route)
// ---------------------------------------------------------------------------

const mockEnvGET = jest.fn();
const mockSchemaGET = jest.fn();
const mockRiskGET = jest.fn();

jest.mock('@/app/api/dev/env-health/route', () => ({
    __esModule: true,
    GET: mockEnvGET,
}));

jest.mock('@/app/api/dev/schema-health/route', () => ({
    __esModule: true,
    GET: mockSchemaGET,
}));

jest.mock('@/app/api/dev/risk-health/route', () => ({
    __esModule: true,
    GET: mockRiskGET,
}));

// Import the health route — jest.mock is hoisted above this import,
// so the sub-route mocks are in place before this module loads.
import { GET } from '../health/route';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeRequest(headers?: Record<string, string>): NextRequest {
    const req = new NextRequest('http://localhost:3000/api/dev/health');
    if (headers) {
        for (const [k, v] of Object.entries(headers)) {
            req.headers.set(k, v);
        }
    }
    return req;
}

function jsonResponse(body: unknown, status = 200): Response {
    return NextResponse.json(body, { status });
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('/api/dev/health', () => {
    const originalEnv = process.env;

    beforeEach(() => {
        process.env = { ...originalEnv };
        process.env.ADMIN_MODE = 'true';

        mockEnvGET.mockReset();
        mockSchemaGET.mockReset();
        mockRiskGET.mockReset();

        mockEnvGET.mockResolvedValue(
            jsonResponse({ status: 'PASS', checks: [] }),
        );
        mockSchemaGET.mockResolvedValue(
            jsonResponse({ status: 'PASS', totalChecked: 25, found: 25, missing: [] }),
        );
        mockRiskGET.mockResolvedValue(
            jsonResponse({ status: 'PASS', checks: [] }),
        );
    });

    afterAll(() => {
        process.env = originalEnv;
    });

    it('returns PASS when all subsystems pass', async () => {
        const res = await GET(makeRequest());
        const body = await res.json();

        expect(body.status).toBe('PASS');
        expect(body.subsystems.env.status).toBe('PASS');
        expect(body.subsystems.schema.status).toBe('PASS');
        expect(body.subsystems.risk.status).toBe('PASS');
    });

    it('returns FAIL when any subsystem fails', async () => {
        mockSchemaGET.mockResolvedValue(
            jsonResponse({
                status: 'FAIL',
                totalChecked: 25,
                found: 24,
                missing: ['trade_ledger.exit_timestamp'],
            }),
        );

        const res = await GET(makeRequest());
        const body = await res.json();

        expect(body.status).toBe('FAIL');
        expect(body.subsystems.schema.status).toBe('FAIL');
    });
});
