/**
 * Admin Gate Tests
 *
 * Tests the checkAdminAuth function for all authorization scenarios.
 */

import { NextRequest } from 'next/server';
import { checkAdminAuth } from '../admin-gate';

describe('checkAdminAuth', () => {
    const originalEnv = process.env;

    beforeEach(() => {
        process.env = { ...originalEnv };
        delete process.env.ADMIN_MODE;
        delete process.env.ADMIN_TOKEN;
    });

    afterAll(() => {
        process.env = originalEnv;
    });

    function makeRequest(headers?: Record<string, string>): NextRequest {
        const req = new NextRequest('http://localhost:3000/test');
        if (headers) {
            for (const [k, v] of Object.entries(headers)) {
                req.headers.set(k, v);
            }
        }
        return req;
    }

    it('allows access when ADMIN_MODE=true', () => {
        process.env.ADMIN_MODE = 'true';
        const result = checkAdminAuth(makeRequest());
        expect(result.authorized).toBe(true);
    });

    it('rejects when no ADMIN_TOKEN configured and ADMIN_MODE not set', () => {
        const result = checkAdminAuth(makeRequest());
        expect(result.authorized).toBe(false);
        expect(result.reason).toContain('ADMIN_TOKEN not configured');
    });

    it('rejects when x-admin-token header missing', () => {
        process.env.ADMIN_TOKEN = 'secret-123';
        const result = checkAdminAuth(makeRequest());
        expect(result.authorized).toBe(false);
        expect(result.reason).toContain('Missing x-admin-token');
    });

    it('rejects when x-admin-token header is wrong', () => {
        process.env.ADMIN_TOKEN = 'secret-123';
        const result = checkAdminAuth(makeRequest({ 'x-admin-token': 'wrong' }));
        expect(result.authorized).toBe(false);
        expect(result.reason).toContain('Invalid admin token');
    });

    it('allows access with correct x-admin-token header', () => {
        process.env.ADMIN_TOKEN = 'secret-123';
        const result = checkAdminAuth(makeRequest({ 'x-admin-token': 'secret-123' }));
        expect(result.authorized).toBe(true);
    });
});
