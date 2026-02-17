/**
 * Environment Health API Route
 *
 * GET /api/dev/env-health
 *
 * Validates that all required and recommended environment variables are
 * configured. Returns PASS/FAIL with a list of missing variable names.
 * NEVER leaks secret values — only reports presence.
 */

import { NextRequest, NextResponse } from 'next/server';
import { checkAdminAuth } from '@/lib/auth/admin-gate';

// =============================================================================
// Check Definitions
// =============================================================================

type Severity = 'CRITICAL' | 'WARN' | 'INFO';

interface EnvCheck {
    name: string;
    vars: string[];
    /** 'all' = every var required; 'any' = at least one required */
    mode: 'all' | 'any';
    severity: Severity;
    purpose: string;
}

const ENV_CHECKS: EnvCheck[] = [
    {
        name: 'SUPABASE_SERVER',
        vars: ['SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY'],
        mode: 'all',
        severity: 'CRITICAL',
        purpose: 'Server-side DB access (risk, journal, ledger)',
    },
    {
        name: 'SUPABASE_PUBLIC',
        vars: ['NEXT_PUBLIC_SUPABASE_URL', 'NEXT_PUBLIC_SUPABASE_ANON_KEY'],
        mode: 'all',
        severity: 'WARN',
        purpose: 'Client-side Supabase access',
    },
    {
        name: 'MARKET_DATA_PROVIDER',
        vars: ['POLYGON_API_KEY', 'MASSIVE_API_KEY'],
        mode: 'any',
        severity: 'WARN',
        purpose: 'Live market data (Polygon/Massive)',
    },
    {
        name: 'BROKER_ALPACA',
        vars: ['ALPACA_API_KEY', 'ALPACA_API_SECRET'],
        mode: 'all',
        severity: 'WARN',
        purpose: 'Broker sync + fill import',
    },
    {
        name: 'LLM_PROVIDER',
        vars: ['OPENAI_API_KEY', 'XAI_API_KEY'],
        mode: 'any',
        severity: 'INFO',
        purpose: 'AI agent reasoning (OpenAI or xAI)',
    },
];

// =============================================================================
// GET Handler
// =============================================================================

interface CheckResult {
    name: string;
    pass: boolean;
    severity: Severity;
    purpose: string;
    missing: string[];
}

export async function GET(request: NextRequest) {
    // Admin gate — return 404 to hide endpoint from public
    const auth = checkAdminAuth(request);
    if (!auth.authorized) return new NextResponse(null, { status: 404 });

    const results: CheckResult[] = [];

    for (const check of ENV_CHECKS) {
        const missing: string[] = [];

        for (const v of check.vars) {
            if (!process.env[v]) {
                missing.push(v);
            }
        }

        let pass: boolean;
        if (check.mode === 'all') {
            pass = missing.length === 0;
        } else {
            // 'any' — at least one must be present
            pass = missing.length < check.vars.length;
        }

        results.push({
            name: check.name,
            pass,
            severity: check.severity,
            purpose: check.purpose,
            missing,
        });
    }

    const criticalFail = results.some(r => !r.pass && r.severity === 'CRITICAL');
    const status = criticalFail ? 'FAIL' : 'PASS';

    return NextResponse.json({
        status,
        totalChecks: results.length,
        passing: results.filter(r => r.pass).length,
        failing: results.filter(r => !r.pass).length,
        checks: results,
        checkedAt: new Date().toISOString(),
    });
}
