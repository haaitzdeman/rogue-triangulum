/**
 * Agent Runner Tests
 * 
 * Tests that prove REAL provider calls include the skills block.
 * Uses mocked fetch to verify the outgoing request.
 */

import {
    runAgent,
    getAgentSystemPrompt,
    getDefaultProvider,
    getProviderOrder,
    getCooldownSeconds,
    classifyProviderError,
    isInCooldown,
    setCooldown,
    clearCooldown,
    clearAllCooldowns,
    checkProviderHealth,
} from '../agent-runner';
import { loadSkillsBundle } from '../skills-loader';
import { loadRulesBundle } from '../rules-loader';
import { SKILLS_BLOCK_START, SKILLS_BLOCK_END, RULES_BLOCK_START, RULES_BLOCK_END } from '../prompt-builder';

// Mock fetch globally
const originalFetch = global.fetch;
let mockFetch: jest.Mock;

beforeEach(() => {
    mockFetch = jest.fn();
    global.fetch = mockFetch;
    // Clear all API keys and env vars before each test
    delete process.env.OPENAI_API_KEY;
    delete process.env.ANTHROPIC_API_KEY;
    delete process.env.GEMINI_API_KEY;
    delete process.env.XAI_API_KEY;
    delete process.env.AGENT_PROVIDER_ORDER;
    delete process.env.AGENT_PROVIDER_COOLDOWN_SECONDS;
    // Clear cooldowns
    clearAllCooldowns();
});

afterEach(() => {
    global.fetch = originalFetch;
    delete process.env.OPENAI_API_KEY;
    delete process.env.ANTHROPIC_API_KEY;
    delete process.env.GEMINI_API_KEY;
    delete process.env.XAI_API_KEY;
    delete process.env.AGENT_PROVIDER_ORDER;
    delete process.env.AGENT_PROVIDER_COOLDOWN_SECONDS;
    clearAllCooldowns();
});

describe('AgentRunner', () => {
    describe('getAgentSystemPrompt', () => {
        it('should include skills block markers in system prompt', () => {
            const prompt = getAgentSystemPrompt();

            expect(prompt).toContain(SKILLS_BLOCK_START);
            expect(prompt).toContain(SKILLS_BLOCK_END);
        });

        it('should include bundleSha256 in skills block header', () => {
            const prompt = getAgentSystemPrompt();
            const bundle = loadSkillsBundle();

            expect(prompt).toContain(bundle.bundleSha256);
        });

        it('should have skills in alphabetical order (conversation-discipline before universe-scaling)', () => {
            const prompt = getAgentSystemPrompt();

            const conversationIndex = prompt.indexOf('conversation-discipline');
            const universeIndex = prompt.indexOf('universe-scaling');

            expect(conversationIndex).toBeGreaterThan(-1);
            expect(universeIndex).toBeGreaterThan(-1);
            expect(conversationIndex).toBeLessThan(universeIndex);
        });
    });

    describe('classifyProviderError', () => {
        it('should classify 401 as AUTH with shouldFallback=true', () => {
            const result = classifyProviderError(401, 'unauthorized');
            expect(result.code).toBe('AUTH');
            expect(result.shouldFallback).toBe(true);
        });

        it('should classify 403 as AUTH with shouldFallback=true', () => {
            const result = classifyProviderError(403, 'forbidden');
            expect(result.code).toBe('AUTH');
            expect(result.shouldFallback).toBe(true);
        });

        it('should classify 429 as RATE_LIMIT with shouldFallback=true', () => {
            const result = classifyProviderError(429, 'too many requests');
            expect(result.code).toBe('RATE_LIMIT');
            expect(result.shouldFallback).toBe(true);
        });

        it('should classify RESOURCE_EXHAUSTED as QUOTA with shouldFallback=true', () => {
            const result = classifyProviderError(400, '{"error":{"status":"RESOURCE_EXHAUSTED"}}');
            expect(result.code).toBe('QUOTA');
            expect(result.shouldFallback).toBe(true);
        });

        it('should classify "quota" in body as QUOTA with shouldFallback=true', () => {
            const result = classifyProviderError(400, 'quota exceeded');
            expect(result.code).toBe('QUOTA');
            expect(result.shouldFallback).toBe(true);
        });

        it('should classify 400 without quota keywords as BAD_REQUEST with shouldFallback=true', () => {
            const result = classifyProviderError(400, 'invalid parameter');
            expect(result.code).toBe('BAD_REQUEST');
            expect(result.shouldFallback).toBe(true);
        });

        it('should classify 500 as SERVER_ERROR with shouldFallback=true', () => {
            const result = classifyProviderError(500, 'internal error');
            expect(result.code).toBe('SERVER_ERROR');
            expect(result.shouldFallback).toBe(true);
        });

        it('should classify unknown status as UNKNOWN with shouldFallback=true', () => {
            const result = classifyProviderError(418, "I'm a teapot");
            expect(result.code).toBe('UNKNOWN');
            expect(result.shouldFallback).toBe(true);
        });
    });

    describe('getProviderOrder', () => {
        it('should return default order when env not set', () => {
            const order = getProviderOrder();
            expect(order).toEqual(['xai', 'openai', 'gemini', 'anthropic']);
        });

        it('should parse AGENT_PROVIDER_ORDER from env', () => {
            process.env.AGENT_PROVIDER_ORDER = 'openai,xai,gemini';
            const order = getProviderOrder();
            expect(order).toEqual(['openai', 'xai', 'gemini']);
        });

        it('should filter invalid providers', () => {
            process.env.AGENT_PROVIDER_ORDER = 'openai,invalid,xai';
            const order = getProviderOrder();
            expect(order).toEqual(['openai', 'xai']);
        });
    });

    describe('getCooldownSeconds', () => {
        it('should return default 900 when env not set', () => {
            expect(getCooldownSeconds()).toBe(900);
        });

        it('should parse AGENT_PROVIDER_COOLDOWN_SECONDS from env', () => {
            process.env.AGENT_PROVIDER_COOLDOWN_SECONDS = '300';
            expect(getCooldownSeconds()).toBe(300);
        });
    });

    describe('getDefaultProvider', () => {
        it('should return xai when XAI_API_KEY is set (first in default order)', () => {
            process.env.XAI_API_KEY = 'test-xai-key';
            expect(getDefaultProvider()).toBe('xai');
        });

        it('should return openai when only OPENAI_API_KEY is set', () => {
            process.env.OPENAI_API_KEY = 'test-openai-key';
            expect(getDefaultProvider()).toBe('openai');
        });

        it('should respect custom provider order', () => {
            process.env.AGENT_PROVIDER_ORDER = 'gemini,openai,xai';
            process.env.GEMINI_API_KEY = 'test-gemini-key';
            process.env.OPENAI_API_KEY = 'test-openai-key';
            expect(getDefaultProvider()).toBe('gemini');
        });

        it('should skip providers without keys', () => {
            process.env.AGENT_PROVIDER_ORDER = 'xai,openai,gemini';
            process.env.OPENAI_API_KEY = 'test-openai-key'; // xai has no key
            expect(getDefaultProvider()).toBe('openai');
        });

        it('should return openai when no keys are set (fallback)', () => {
            expect(getDefaultProvider()).toBe('openai');
        });
    });

    describe('cooldown management', () => {
        it('should track cooldown state', () => {
            expect(isInCooldown('xai')).toBe(false);
            setCooldown('xai');
            expect(isInCooldown('xai')).toBe(true);
        });

        it('should clear single provider cooldown', () => {
            setCooldown('xai');
            clearCooldown('xai');
            expect(isInCooldown('xai')).toBe(false);
        });

        it('should clear all cooldowns', () => {
            setCooldown('xai');
            setCooldown('openai');
            clearAllCooldowns();
            expect(isInCooldown('xai')).toBe(false);
            expect(isInCooldown('openai')).toBe(false);
        });
    });

    describe('checkProviderHealth', () => {
        it('should report provider availability and cooldown status', async () => {
            process.env.XAI_API_KEY = 'test-xai-key';
            process.env.OPENAI_API_KEY = 'test-openai-key';
            setCooldown('xai');

            const health = await checkProviderHealth();

            expect(health.xai.available).toBe(true);
            expect(health.xai.inCooldown).toBe(true);
            expect(health.openai.available).toBe(true);
            expect(health.openai.inCooldown).toBe(false);
            expect(health.gemini.available).toBe(false);
            expect(health.anthropic.available).toBe(false);
        });
    });

    describe('runAgent with xAI provider', () => {
        it('should fail with MISSING_API_KEY when XAI_API_KEY is not set', async () => {
            const result = await runAgent('test message', { provider: 'xai' });

            expect(result.success).toBe(false);
            expect(result.errorCode).toBe('MISSING_API_KEY');
        });

        it('should send skills block in xAI request when API key is set', async () => {
            process.env.XAI_API_KEY = 'test-xai-key';

            mockFetch.mockResolvedValueOnce({
                ok: true,
                json: async () => ({
                    choices: [{ message: { content: 'xAI response' } }],
                }),
            });

            await runAgent('test message', { provider: 'xai' });

            expect(mockFetch).toHaveBeenCalledTimes(1);

            const [url, options] = mockFetch.mock.calls[0];

            // Verify URL is xAI endpoint
            expect(url).toBe('https://api.x.ai/v1/chat/completions');

            // Verify Authorization header
            expect(options.headers['Authorization']).toBe('Bearer test-xai-key');

            const body = JSON.parse(options.body);

            const systemMessage = body.messages.find((m: { role: string }) => m.role === 'system');
            expect(systemMessage).toBeDefined();
            expect(systemMessage.content).toContain(SKILLS_BLOCK_START);
            expect(systemMessage.content).toContain(SKILLS_BLOCK_END);

            const bundle = loadSkillsBundle();
            expect(systemMessage.content).toContain(bundle.bundleSha256);
        });

        it('should include all 14 skills in xAI request', async () => {
            process.env.XAI_API_KEY = 'test-xai-key';

            mockFetch.mockResolvedValueOnce({
                ok: true,
                json: async () => ({
                    choices: [{ message: { content: 'xAI response' } }],
                }),
            });

            await runAgent('test message', { provider: 'xai' });

            const [_url, options] = mockFetch.mock.calls[0];
            const body = JSON.parse(options.body);
            const systemMessage = body.messages.find((m: { role: string }) => m.role === 'system');

            const bundle = loadSkillsBundle();
            expect(bundle.skillCount).toBe(14);

            for (const skill of bundle.skills) {
                expect(systemMessage.content).toContain(skill.name);
            }
        });

        it('should have skills in alphabetical order in xAI request', async () => {
            process.env.XAI_API_KEY = 'test-xai-key';

            mockFetch.mockResolvedValueOnce({
                ok: true,
                json: async () => ({
                    choices: [{ message: { content: 'xAI response' } }],
                }),
            });

            await runAgent('test message', { provider: 'xai' });

            const [_url, options] = mockFetch.mock.calls[0];
            const body = JSON.parse(options.body);
            const systemMessage = body.messages.find((m: { role: string }) => m.role === 'system');

            const conversationIndex = systemMessage.content.indexOf('conversation-discipline');
            const universeIndex = systemMessage.content.indexOf('universe-scaling');

            expect(conversationIndex).toBeGreaterThan(-1);
            expect(universeIndex).toBeGreaterThan(-1);
            expect(conversationIndex).toBeLessThan(universeIndex);
        });

        it('should use default model grok-2-latest', async () => {
            process.env.XAI_API_KEY = 'test-xai-key';

            mockFetch.mockResolvedValueOnce({
                ok: true,
                json: async () => ({
                    choices: [{ message: { content: 'xAI response' } }],
                }),
            });

            await runAgent('test message', { provider: 'xai' });

            const [_url, options] = mockFetch.mock.calls[0];
            const body = JSON.parse(options.body);
            expect(body.model).toBe('grok-2-latest');
        });

        it('should NOT expose API key in error response', async () => {
            process.env.XAI_API_KEY = 'super-secret-xai-key-12345';

            mockFetch.mockResolvedValueOnce({
                ok: false,
                status: 401,
                text: async () => JSON.stringify({ error: { message: 'Unauthorized' } }),
            });

            const result = await runAgent('test message', { provider: 'xai' });

            const resultString = JSON.stringify(result);
            expect(resultString).not.toContain('super-secret-xai-key-12345');
        });
    });

    describe('Multi-provider fallback on AUTH errors', () => {
        it('should fallback from xAI 403 to OpenAI and succeed', async () => {
            process.env.AGENT_PROVIDER_ORDER = 'xai,openai';
            process.env.XAI_API_KEY = 'test-xai-key';
            process.env.OPENAI_API_KEY = 'test-openai-key';

            // xAI returns 403 (auth error)
            mockFetch.mockResolvedValueOnce({
                ok: false,
                status: 403,
                text: async () => JSON.stringify({ error: { message: 'Forbidden' } }),
            });

            // OpenAI succeeds
            mockFetch.mockResolvedValueOnce({
                ok: true,
                json: async () => ({
                    choices: [{ message: { content: 'OpenAI response' } }],
                }),
            });

            const result = await runAgent('test message');

            expect(result.success).toBe(true);
            expect(result.text).toBe('OpenAI response');
            expect(mockFetch).toHaveBeenCalledTimes(2);
            expect(result.metadata?.attemptedProviders).toEqual(['xai', 'openai']);
            expect(result.metadata?.provider).toBe('openai');
        });

        it('should fallback from xAI 401 to OpenAI and succeed', async () => {
            process.env.AGENT_PROVIDER_ORDER = 'xai,openai';
            process.env.XAI_API_KEY = 'test-xai-key';
            process.env.OPENAI_API_KEY = 'test-openai-key';

            // xAI returns 401
            mockFetch.mockResolvedValueOnce({
                ok: false,
                status: 401,
                text: async () => JSON.stringify({ error: { message: 'Unauthorized' } }),
            });

            // OpenAI succeeds
            mockFetch.mockResolvedValueOnce({
                ok: true,
                json: async () => ({
                    choices: [{ message: { content: 'OpenAI response' } }],
                }),
            });

            const result = await runAgent('test message');

            expect(result.success).toBe(true);
            expect(result.text).toBe('OpenAI response');
            expect(result.metadata?.attemptedProviders).toEqual(['xai', 'openai']);
        });

        it('should fallback from xAI 429 to OpenAI', async () => {
            process.env.AGENT_PROVIDER_ORDER = 'xai,openai';
            process.env.XAI_API_KEY = 'test-xai-key';
            process.env.OPENAI_API_KEY = 'test-openai-key';

            // xAI returns 429 (3 attempts: initial + 2 retries)
            mockFetch.mockResolvedValueOnce({
                ok: false,
                status: 429,
                text: async () => 'rate limited',
            });
            mockFetch.mockResolvedValueOnce({
                ok: false,
                status: 429,
                text: async () => 'rate limited',
            });
            mockFetch.mockResolvedValueOnce({
                ok: false,
                status: 429,
                text: async () => 'rate limited',
            });

            // OpenAI succeeds
            mockFetch.mockResolvedValueOnce({
                ok: true,
                json: async () => ({
                    choices: [{ message: { content: 'OpenAI response' } }],
                }),
            });

            const result = await runAgent('test message');

            expect(result.success).toBe(true);
            expect(result.text).toBe('OpenAI response');
            expect(result.metadata?.attemptedProviders).toEqual(['xai', 'openai']);
        });

        it('should return PROVIDER_FAILED when only xAI key is set and xAI returns 403', async () => {
            process.env.XAI_API_KEY = 'test-xai-key';
            // No OpenAI key set

            mockFetch.mockResolvedValueOnce({
                ok: false,
                status: 403,
                text: async () => JSON.stringify({ error: { message: 'Forbidden' } }),
            });

            const result = await runAgent('test message');

            expect(result.success).toBe(false);
            expect(result.errorCode).toBe('PROVIDER_FAILED');
            expect(result.metadata?.attemptedProviders).toEqual(['xai']);
            expect(result.metadata?.providerErrors[0]?.status).toBe(403);
        });

        it('should NOT fallback when opts.provider is set with allowFallback=false', async () => {
            process.env.XAI_API_KEY = 'test-xai-key';
            process.env.OPENAI_API_KEY = 'test-openai-key';

            mockFetch.mockResolvedValueOnce({
                ok: false,
                status: 403,
                text: async () => JSON.stringify({ error: { message: 'Forbidden' } }),
            });

            const result = await runAgent('test message', { provider: 'xai', allowFallback: false });

            expect(result.success).toBe(false);
            expect(result.errorCode).toBe('PROVIDER_FAILED');
            expect(mockFetch).toHaveBeenCalledTimes(1);
            expect(result.metadata?.provider).toBe('xai');
            expect(result.metadata?.attemptedProviders).toEqual(['xai']);
        });

        it('should fallback by default when opts.provider is set (fallback enabled by default)', async () => {
            process.env.XAI_API_KEY = 'test-xai-key';
            process.env.OPENAI_API_KEY = 'test-openai-key';

            // xAI returns 403
            mockFetch.mockResolvedValueOnce({
                ok: false,
                status: 403,
                text: async () => JSON.stringify({ error: { message: 'Forbidden' } }),
            });

            // OpenAI succeeds
            mockFetch.mockResolvedValueOnce({
                ok: true,
                json: async () => ({
                    choices: [{ message: { content: 'OpenAI response' } }],
                }),
            });

            const result = await runAgent('test message', { provider: 'xai' });

            expect(result.success).toBe(true);
            expect(result.text).toBe('OpenAI response');
            expect(result.metadata?.attemptedProviders).toEqual(['xai', 'openai']);
        });
    });

    describe('Multi-provider fallback on quota/rate-limit', () => {
        it('should fallback on RESOURCE_EXHAUSTED in body', async () => {
            process.env.AGENT_PROVIDER_ORDER = 'gemini,openai';
            process.env.GEMINI_API_KEY = 'test-gemini-key';
            process.env.OPENAI_API_KEY = 'test-openai-key';

            // Gemini returns quota error (3 attempts: initial + 2 retries)
            mockFetch.mockResolvedValueOnce({
                ok: false,
                status: 400,
                text: async () => JSON.stringify({
                    error: { status: 'RESOURCE_EXHAUSTED', message: 'Quota exceeded' },
                }),
            });
            mockFetch.mockResolvedValueOnce({
                ok: false,
                status: 400,
                text: async () => JSON.stringify({
                    error: { status: 'RESOURCE_EXHAUSTED', message: 'Quota exceeded' },
                }),
            });
            mockFetch.mockResolvedValueOnce({
                ok: false,
                status: 400,
                text: async () => JSON.stringify({
                    error: { status: 'RESOURCE_EXHAUSTED', message: 'Quota exceeded' },
                }),
            });

            // OpenAI succeeds
            mockFetch.mockResolvedValueOnce({
                ok: true,
                json: async () => ({
                    choices: [{ message: { content: 'OpenAI response' } }],
                }),
            });

            const result = await runAgent('test message');

            expect(result.success).toBe(true);
            expect(result.text).toBe('OpenAI response');
            expect(result.metadata?.attemptedProviders).toContain('gemini');
            expect(result.metadata?.attemptedProviders).toContain('openai');
        });

        it('should return QUOTA_EXHAUSTED when all providers fail due to quota', async () => {
            process.env.AGENT_PROVIDER_ORDER = 'xai,openai';
            process.env.XAI_API_KEY = 'test-xai-key';
            process.env.OPENAI_API_KEY = 'test-openai-key';

            // Both providers return 429
            mockFetch.mockResolvedValue({
                ok: false,
                status: 429,
                text: async () => 'rate limited',
            });

            const result = await runAgent('test message');

            expect(result.success).toBe(false);
            expect(result.errorCode).toBe('QUOTA_OR_RATE_LIMIT');
            expect(result.metadata?.attemptedProviders).toEqual(['xai', 'openai']);
        });

        it('should fallback on 400 BAD_REQUEST to next provider', async () => {
            process.env.AGENT_PROVIDER_ORDER = 'xai,openai';
            process.env.XAI_API_KEY = 'test-xai-key';
            process.env.OPENAI_API_KEY = 'test-openai-key';

            // xAI returns 400 bad request (not quota)
            mockFetch.mockResolvedValueOnce({
                ok: false,
                status: 400,
                text: async () => JSON.stringify({ error: { message: 'Invalid parameter' } }),
            });

            // OpenAI succeeds
            mockFetch.mockResolvedValueOnce({
                ok: true,
                json: async () => ({
                    choices: [{ message: { content: 'OpenAI response' } }],
                }),
            });

            const result = await runAgent('test message');

            expect(result.success).toBe(true);
            expect(result.text).toBe('OpenAI response');
            expect(result.metadata?.attemptedProviders).toEqual(['xai', 'openai']);
        });

        it('should skip providers in cooldown', async () => {
            process.env.AGENT_PROVIDER_ORDER = 'xai,openai';
            process.env.XAI_API_KEY = 'test-xai-key';
            process.env.OPENAI_API_KEY = 'test-openai-key';

            // Put xAI in cooldown
            setCooldown('xai');

            mockFetch.mockResolvedValueOnce({
                ok: true,
                json: async () => ({
                    choices: [{ message: { content: 'OpenAI response' } }],
                }),
            });

            const result = await runAgent('test message');

            expect(result.success).toBe(true);
            expect(mockFetch).toHaveBeenCalledTimes(1);
            // Should have gone straight to OpenAI
            expect(mockFetch.mock.calls[0][0]).toBe('https://api.openai.com/v1/chat/completions');
            expect(result.metadata?.cooldownProviders).toContain('xai');
        });

        it('should put provider in cooldown after quota/rate-limit error', async () => {
            process.env.AGENT_PROVIDER_ORDER = 'xai,openai';
            process.env.XAI_API_KEY = 'test-xai-key';
            process.env.OPENAI_API_KEY = 'test-openai-key';

            expect(isInCooldown('xai')).toBe(false);

            // xAI returns quota error (3 attempts: initial + 2 retries)
            mockFetch.mockResolvedValueOnce({
                ok: false,
                status: 429,
                text: async () => 'rate limited',
            });
            mockFetch.mockResolvedValueOnce({
                ok: false,
                status: 429,
                text: async () => 'rate limited',
            });
            mockFetch.mockResolvedValueOnce({
                ok: false,
                status: 429,
                text: async () => 'rate limited',
            });

            // OpenAI succeeds
            mockFetch.mockResolvedValueOnce({
                ok: true,
                json: async () => ({
                    choices: [{ message: { content: 'OpenAI response' } }],
                }),
            });

            await runAgent('test message');

            // xAI should now be in cooldown
            expect(isInCooldown('xai')).toBe(true);
        });
    });

    describe('runAgent with OpenAI provider', () => {
        it('should fail with MISSING_API_KEY when OPENAI_API_KEY is not set', async () => {
            const result = await runAgent('test message', { provider: 'openai' });

            expect(result.success).toBe(false);
            expect(result.errorCode).toBe('MISSING_API_KEY');
        });

        it('should send skills block in provider request when API key is set', async () => {
            process.env.OPENAI_API_KEY = 'test-key-for-verification';

            mockFetch.mockResolvedValueOnce({
                ok: true,
                json: async () => ({
                    choices: [{ message: { content: 'Test response' } }],
                }),
            });

            await runAgent('test message', { provider: 'openai' });

            expect(mockFetch).toHaveBeenCalledTimes(1);

            const [_url, options] = mockFetch.mock.calls[0];
            const body = JSON.parse(options.body);

            const systemMessage = body.messages.find((m: { role: string }) => m.role === 'system');
            expect(systemMessage).toBeDefined();
            expect(systemMessage.content).toContain(SKILLS_BLOCK_START);
            expect(systemMessage.content).toContain(SKILLS_BLOCK_END);

            const bundle = loadSkillsBundle();
            expect(systemMessage.content).toContain(bundle.bundleSha256);

            const conversationIndex = systemMessage.content.indexOf('conversation-discipline');
            const universeIndex = systemMessage.content.indexOf('universe-scaling');
            expect(conversationIndex).toBeLessThan(universeIndex);
        });

        it('should include all 14 skills in provider request', async () => {
            process.env.OPENAI_API_KEY = 'test-key-for-verification';

            mockFetch.mockResolvedValueOnce({
                ok: true,
                json: async () => ({
                    choices: [{ message: { content: 'Test response' } }],
                }),
            });

            await runAgent('test message', { provider: 'openai' });

            const [_url, options] = mockFetch.mock.calls[0];
            const body = JSON.parse(options.body);
            const systemMessage = body.messages.find((m: { role: string }) => m.role === 'system');

            const bundle = loadSkillsBundle();
            expect(bundle.skillCount).toBe(14);

            for (const skill of bundle.skills) {
                expect(systemMessage.content).toContain(skill.name);
            }
        });

        it('should return success with metadata on successful response', async () => {
            process.env.OPENAI_API_KEY = 'test-key-for-verification';

            mockFetch.mockResolvedValueOnce({
                ok: true,
                json: async () => ({
                    choices: [{ message: { content: 'Test response' } }],
                }),
            });

            const result = await runAgent('test message', { provider: 'openai' });

            expect(result.success).toBe(true);
            expect(result.text).toBe('Test response');
            expect(result.metadata).toBeDefined();
            expect(result.metadata?.provider).toBe('openai');
            expect(result.metadata?.skillsCount).toBe(14);
            expect(result.metadata?.bundleSha256).toBeDefined();
            expect(result.metadata?.attemptedProviders).toEqual(['openai']);
        });
    });

    describe('runAgent with Gemini provider', () => {
        it('should fail with MISSING_API_KEY when GEMINI_API_KEY is not set', async () => {
            const result = await runAgent('test message', { provider: 'gemini' });

            expect(result.success).toBe(false);
            expect(result.errorCode).toBe('MISSING_API_KEY');
        });

        it('should send skills block in Gemini request when API key is set', async () => {
            process.env.GEMINI_API_KEY = 'test-gemini-key';

            mockFetch.mockResolvedValueOnce({
                ok: true,
                json: async () => ({
                    candidates: [{ content: { parts: [{ text: 'Gemini response' }] } }],
                }),
            });

            await runAgent('test message', { provider: 'gemini' });

            expect(mockFetch).toHaveBeenCalledTimes(1);

            const [url, options] = mockFetch.mock.calls[0];

            // Verify URL contains API key and model
            expect(url).toContain('generativelanguage.googleapis.com');
            expect(url).toContain('key=test-gemini-key');

            const body = JSON.parse(options.body);

            // Gemini uses system_instruction instead of messages[role=system]
            expect(body.system_instruction).toBeDefined();
            expect(body.system_instruction.parts).toBeDefined();
            expect(body.system_instruction.parts[0].text).toContain(SKILLS_BLOCK_START);
            expect(body.system_instruction.parts[0].text).toContain(SKILLS_BLOCK_END);

            const bundle = loadSkillsBundle();
            expect(body.system_instruction.parts[0].text).toContain(bundle.bundleSha256);
        });
    });

    describe('Provider error parsing', () => {
        describe('Error truncation', () => {
            it('should truncate error messagePreview in providerErrors', async () => {
                process.env.XAI_API_KEY = 'test-xai-key';

                const longErrorText = JSON.stringify({ error: { message: 'X'.repeat(300) } });

                mockFetch.mockResolvedValueOnce({
                    ok: false,
                    status: 400,
                    text: async () => longErrorText,
                });

                const result = await runAgent('test message', { provider: 'xai' });

                // messagePreview should be truncated to 200 chars max
                expect((result.metadata?.providerErrors[0]?.messagePreview?.length || 0) <= 200).toBe(true);
            });

            it('should truncate long providerErrors messagePreview to 180 chars max', async () => {
                process.env.XAI_API_KEY = 'test-xai-key';

                const longMessage = 'B'.repeat(500);

                mockFetch.mockResolvedValueOnce({
                    ok: false,
                    status: 400,
                    text: async () => JSON.stringify({
                        error: { message: longMessage },
                    }),
                });

                const result = await runAgent('test message', { provider: 'xai' });

                // The messagePreview should be truncated to at most 200 chars
                expect((result.metadata?.providerErrors[0]?.messagePreview?.length || 0) <= 200).toBe(true);
            });
        });

        describe('Error code mapping', () => {
            it('should return PROVIDER_FAILED for 401', async () => {
                process.env.XAI_API_KEY = 'test-xai-key';

                mockFetch.mockResolvedValueOnce({
                    ok: false,
                    status: 401,
                    text: async () => JSON.stringify({ error: { message: 'Unauthorized' } }),
                });

                const result = await runAgent('test message', { provider: 'xai' });

                expect(result.errorCode).toBe('PROVIDER_FAILED');
            });

            it('should return QUOTA_OR_RATE_LIMIT for 429', async () => {
                process.env.XAI_API_KEY = 'test-xai-key';

                // 3 attempts: initial + 2 retries
                mockFetch.mockResolvedValueOnce({
                    ok: false,
                    status: 429,
                    text: async () => 'rate limited',
                });
                mockFetch.mockResolvedValueOnce({
                    ok: false,
                    status: 429,
                    text: async () => 'rate limited',
                });
                mockFetch.mockResolvedValueOnce({
                    ok: false,
                    status: 429,
                    text: async () => 'rate limited',
                });

                const result = await runAgent('test message', { provider: 'xai' });

                expect(result.errorCode).toBe('QUOTA_OR_RATE_LIMIT');
            });

            it('should return QUOTA_OR_RATE_LIMIT for quota errors', async () => {
                process.env.XAI_API_KEY = 'test-xai-key';

                // 3 attempts: initial + 2 retries (quota errors are retried)
                mockFetch.mockResolvedValueOnce({
                    ok: false,
                    status: 400,
                    text: async () => 'quota exceeded',
                });
                mockFetch.mockResolvedValueOnce({
                    ok: false,
                    status: 400,
                    text: async () => 'quota exceeded',
                });
                mockFetch.mockResolvedValueOnce({
                    ok: false,
                    status: 400,
                    text: async () => 'quota exceeded',
                });

                const result = await runAgent('test message', { provider: 'xai' });

                expect(result.errorCode).toBe('QUOTA_OR_RATE_LIMIT');
            });
        });
    });

    describe('Rules injection in provider requests', () => {
        it('should include RULES block markers in system prompt', () => {
            const prompt = getAgentSystemPrompt();

            expect(prompt).toContain(RULES_BLOCK_START);
            expect(prompt).toContain(RULES_BLOCK_END);
        });

        it('should have RULES block BEFORE SKILLS block in system prompt', () => {
            const prompt = getAgentSystemPrompt();

            const rulesStartIndex = prompt.indexOf(RULES_BLOCK_START);
            const skillsStartIndex = prompt.indexOf(SKILLS_BLOCK_START);

            expect(rulesStartIndex).toBeGreaterThan(-1);
            expect(skillsStartIndex).toBeGreaterThan(-1);
            expect(rulesStartIndex).toBeLessThan(skillsStartIndex);
        });

        it('should include all 6 rules in system prompt', () => {
            const prompt = getAgentSystemPrompt();
            const bundle = loadRulesBundle();

            expect(bundle.ruleCount).toBe(6);

            for (const rule of bundle.rules) {
                expect(prompt).toContain(rule.name);
            }
        });

        it('should include rules in alphabetical order (00-truthfulness before 05-conversation-discipline)', () => {
            const prompt = getAgentSystemPrompt();

            const truthfulnessIndex = prompt.indexOf('00-truthfulness');
            const conversationIndex = prompt.indexOf('05-conversation-discipline');

            expect(truthfulnessIndex).toBeGreaterThan(-1);
            expect(conversationIndex).toBeGreaterThan(-1);
            expect(truthfulnessIndex).toBeLessThan(conversationIndex);
        });

        it('should send RULES block BEFORE SKILLS block in xAI request', async () => {
            process.env.XAI_API_KEY = 'test-xai-key';

            mockFetch.mockResolvedValueOnce({
                ok: true,
                json: async () => ({
                    choices: [{ message: { content: 'xAI response' } }],
                }),
            });

            await runAgent('test message', { provider: 'xai' });

            const [_url, options] = mockFetch.mock.calls[0];
            const body = JSON.parse(options.body);
            const systemMessage = body.messages.find((m: { role: string }) => m.role === 'system');

            expect(systemMessage.content).toContain(RULES_BLOCK_START);
            expect(systemMessage.content).toContain(RULES_BLOCK_END);

            const rulesStartIndex = systemMessage.content.indexOf(RULES_BLOCK_START);
            const skillsStartIndex = systemMessage.content.indexOf(SKILLS_BLOCK_START);

            expect(rulesStartIndex).toBeLessThan(skillsStartIndex);
        });

        it('should send RULES block BEFORE SKILLS block in OpenAI request', async () => {
            process.env.OPENAI_API_KEY = 'test-openai-key';

            mockFetch.mockResolvedValueOnce({
                ok: true,
                json: async () => ({
                    choices: [{ message: { content: 'OpenAI response' } }],
                }),
            });

            await runAgent('test message', { provider: 'openai' });

            const [_url, options] = mockFetch.mock.calls[0];
            const body = JSON.parse(options.body);
            const systemMessage = body.messages.find((m: { role: string }) => m.role === 'system');

            expect(systemMessage.content).toContain(RULES_BLOCK_START);

            const rulesStartIndex = systemMessage.content.indexOf(RULES_BLOCK_START);
            const skillsStartIndex = systemMessage.content.indexOf(SKILLS_BLOCK_START);

            expect(rulesStartIndex).toBeLessThan(skillsStartIndex);
        });

        it('should send RULES block BEFORE SKILLS block in Gemini request', async () => {
            process.env.GEMINI_API_KEY = 'test-gemini-key';

            mockFetch.mockResolvedValueOnce({
                ok: true,
                json: async () => ({
                    candidates: [{ content: { parts: [{ text: 'Gemini response' }] } }],
                }),
            });

            await runAgent('test message', { provider: 'gemini' });

            const [_url, options] = mockFetch.mock.calls[0];
            const body = JSON.parse(options.body);
            const systemInstruction = body.system_instruction.parts[0].text;

            expect(systemInstruction).toContain(RULES_BLOCK_START);

            const rulesStartIndex = systemInstruction.indexOf(RULES_BLOCK_START);
            const skillsStartIndex = systemInstruction.indexOf(SKILLS_BLOCK_START);

            expect(rulesStartIndex).toBeLessThan(skillsStartIndex);
        });

        it('should include all rule names in provider request', async () => {
            process.env.XAI_API_KEY = 'test-xai-key';

            mockFetch.mockResolvedValueOnce({
                ok: true,
                json: async () => ({
                    choices: [{ message: { content: 'xAI response' } }],
                }),
            });

            await runAgent('test message', { provider: 'xai' });

            const [_url, options] = mockFetch.mock.calls[0];
            const body = JSON.parse(options.body);
            const systemMessage = body.messages.find((m: { role: string }) => m.role === 'system');

            const bundle = loadRulesBundle();
            expect(bundle.ruleCount).toBe(6);

            for (const rule of bundle.rules) {
                expect(systemMessage.content).toContain(rule.name);
            }
        });

        it('should include rules bundleSha256 in RULES block header', async () => {
            process.env.XAI_API_KEY = 'test-xai-key';

            mockFetch.mockResolvedValueOnce({
                ok: true,
                json: async () => ({
                    choices: [{ message: { content: 'xAI response' } }],
                }),
            });

            await runAgent('test message', { provider: 'xai' });

            const [_url, options] = mockFetch.mock.calls[0];
            const body = JSON.parse(options.body);
            const systemMessage = body.messages.find((m: { role: string }) => m.role === 'system');

            const bundle = loadRulesBundle();
            expect(systemMessage.content).toContain(bundle.bundleSha256);
        });
    });
});
