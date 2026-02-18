export const dynamic = 'force-dynamic';

/**
 * Unified Health Index API Route
 *
 * GET /api/dev/health
 *
 * Aggregates results from env-health, schema-health, and risk-health
 * into a single PASS/FAIL verdict with full subsystem details.
 *
 * Forwards the caller's x-admin-token header to each sub-route so
 * they pass their own admin gate checks.
 */

import { NextRequest, NextResponse } from 'next/server';
import { checkAdminAuth } from '@/lib/auth/admin-gate';
import { GET as envHealthGET } from '@/app/api/dev/env-health/route';
import { GET as schemaHealthGET } from '@/app/api/dev/schema-health/route';
import { GET as riskHealthGET } from '@/app/api/dev/risk-health/route';

// =============================================================================
// Types
// =============================================================================

interface SubsystemResult {
    status: string;
    [key: string]: unknown;
}

interface HealthIndex {
    status: 'PASS' | 'FAIL';
    subsystems: {
        env: SubsystemResult;
        schema: SubsystemResult;
        risk: SubsystemResult;
    };
    checkedAt: string;
}

// =============================================================================
// Subsystem fetchers
// =============================================================================

type SubsystemGET = (request: NextRequest) => Promise<Response>;

const SUBSYSTEMS: Record<string, SubsystemGET> = {
    env: envHealthGET,
    schema: schemaHealthGET,
    risk: riskHealthGET,
};

async function fetchSubsystem(
    name: string,
    getter: SubsystemGET,
    parentRequest: NextRequest,
): Promise<SubsystemResult> {
    try {
        // Forward auth headers so sub-routes pass their own admin gate
        const headers: Record<string, string> = {};
        const adminToken = parentRequest.headers.get('x-admin-token');
        if (adminToken) {
            headers['x-admin-token'] = adminToken;
        }

        const fakeRequest = new NextRequest(
            `http://localhost:3000/api/dev/${name}-health`,
            { headers },
        );
        const response = await getter(fakeRequest);

        // Handle non-2xx responses (e.g. 503 from schema-health)
        if (!response.ok) {
            try {
                const body = await response.json();
                return {
                    status: 'FAIL',
                    error:
                        typeof body?.error === 'string'
                            ? body.error.slice(0, 200)
                            : `Subsystem returned ${response.status}`,
                };
            } catch {
                return {
                    status: 'FAIL',
                    error: `Subsystem returned ${response.status}`,
                };
            }
        }

        const data = await response.json();
        return data as SubsystemResult;
    } catch (err) {
        return {
            status: 'FAIL',
            error:
                err instanceof Error
                    ? err.message.slice(0, 200)
                    : 'Failed to reach subsystem',
        };
    }
}

// =============================================================================
// GET Handler
// =============================================================================

export async function GET(request: NextRequest) {
    // Admin gate — return 404 to hide endpoint from public
    const auth = checkAdminAuth(request);
    if (!auth.authorized) return new NextResponse(null, { status: 404 });

    const [env, schema, risk] = await Promise.all([
        fetchSubsystem('env', SUBSYSTEMS.env, request),
        fetchSubsystem('schema', SUBSYSTEMS.schema, request),
        fetchSubsystem('risk', SUBSYSTEMS.risk, request),
    ]);

    const statuses = [env.status, schema.status, risk.status];
    const allPass = statuses.every((s) => s === 'PASS');

    const result: HealthIndex = {
        status: allPass ? 'PASS' : 'FAIL',
        subsystems: { env, schema, risk },
        checkedAt: new Date().toISOString(),
    };

    return NextResponse.json(result);
}
