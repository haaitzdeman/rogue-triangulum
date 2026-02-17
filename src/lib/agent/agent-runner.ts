/**
 * Agent Runner
 * 
 * Minimal safe server-side agent runtime that uses the skills bundle.
 * This is the ONLY place that makes LLM provider calls.
 * 
 * Supported providers: OpenAI, Anthropic, Gemini, xAI (Grok)
 * 
 * Features:
 * - Multi-provider fallback with configurable order
 * - Auth/quota/rate-limit detection with automatic fallback
 * - Retry with exponential backoff for 429/503
 * - Detailed providerErrors diagnostics
 * - Skills injection from prompt-builder
 * 
 * Safety rules:
 * - Server-side only (no client fs usage)
 * - No secrets in responses or logs
 * - Hard fails if all providers fail
 * - Strict timeouts
 * - Deterministic prompt formatting
 * - Logs bundleSha256 for proof (no keys)
 */

import { buildSystemPrompt, SKILLS_BLOCK_START, SKILLS_BLOCK_END, RULES_BLOCK_START, RULES_BLOCK_END } from './prompt-builder';
import { loadSkillsBundle } from './skills-loader';
import { loadRulesBundle } from './rules-loader';

/**
 * Supported LLM providers
 */
export type LLMProvider = 'openai' | 'anthropic' | 'gemini' | 'xai';

/**
 * Provider error classification
 */
export type ProviderErrorCode = 'AUTH' | 'QUOTA' | 'RATE_LIMIT' | 'BAD_REQUEST' | 'SERVER_ERROR' | 'NOT_FOUND' | 'UNKNOWN';

export interface ProviderErrorClassification {
    code: ProviderErrorCode;
    shouldFallback: boolean;
    shouldRetry: boolean;
}

/**
 * Agent run options
 */
export interface AgentRunOptions {
    model?: string;
    provider?: LLMProvider;
    allowFallback?: boolean;
    maxTokens?: number;
    temperature?: number;
    timeoutMs?: number;
}

/**
 * Individual provider error info (safe to expose - no secrets)
 */
export interface ProviderErrorInfo {
    provider: LLMProvider;
    status?: number;
    code?: string;
    messagePreview?: string;
}

/**
 * Agent run result metadata
 */
export interface AgentResultMetadata {
    model: string;
    provider: LLMProvider;
    promptLength: number;
    bundleSha256: string;
    skillsCount: number;
    rulesBundleSha256?: string;
    rulesCount?: number;
    attemptedProviders: LLMProvider[];
    providerErrors: ProviderErrorInfo[];
    cooldownProviders?: LLMProvider[];
}

/**
 * Agent run result
 */
export interface AgentRunResult {
    success: boolean;
    text?: string;
    errorCode?: string;
    error?: string;
    metadata?: AgentResultMetadata;
}

/**
 * Default configuration
 */
const DEFAULTS = {
    provider: 'openai' as LLMProvider,
    openaiModel: 'gpt-4o-mini',
    anthropicModel: 'claude-3-haiku-20240307',
    geminiModel: 'gemini-2.0-flash',
    xaiModel: 'grok-2-latest',
    xaiBaseUrl: 'https://api.x.ai/v1',
    maxTokens: 2048,
    temperature: 0.7,
    timeoutMs: 30000,
    providerOrder: ['xai', 'openai', 'gemini', 'anthropic'] as LLMProvider[],
    cooldownSeconds: 900,
    maxRetries: 2,
    retryBaseDelayMs: 400,
};

/**
 * In-memory cooldown map: provider => cooldown expiry timestamp
 */
const cooldownUntil: Partial<Record<LLMProvider, number>> = {};

/**
 * Classify a provider error to determine if fallback/retry should occur
 */
export function classifyProviderError(status: number, bodyText: string): ProviderErrorClassification {
    const lowerBody = bodyText.toLowerCase();

    // AUTH errors (401, 403) - should fallback, don't retry
    if (status === 401 || status === 403) {
        return { code: 'AUTH', shouldFallback: true, shouldRetry: false };
    }

    // Not Found (404) - should fallback, don't retry
    if (status === 404) {
        return { code: 'NOT_FOUND', shouldFallback: true, shouldRetry: false };
    }

    // Rate limit (429) - should fallback and retry
    if (status === 429) {
        return { code: 'RATE_LIMIT', shouldFallback: true, shouldRetry: true };
    }

    // Check for quota/rate-limit patterns in body (any status)
    const quotaPatterns = [
        'resource_exhausted',
        'quota',
        'rate limit',
        'rate_limit',
        'insufficient_quota',
    ];

    for (const pattern of quotaPatterns) {
        if (lowerBody.includes(pattern)) {
            return { code: 'QUOTA', shouldFallback: true, shouldRetry: true };
        }
    }

    // 400 Bad Request - should fallback (could be provider-specific issue)
    if (status === 400) {
        return { code: 'BAD_REQUEST', shouldFallback: true, shouldRetry: false };
    }

    // 503 Service Unavailable - should fallback and retry
    if (status === 503) {
        return { code: 'SERVER_ERROR', shouldFallback: true, shouldRetry: true };
    }

    // Other 5xx Server errors - should fallback but don't retry (could be permanent)
    if (status >= 500 && status < 600) {
        return { code: 'SERVER_ERROR', shouldFallback: true, shouldRetry: false };
    }

    // Unknown errors - be conservative, fallback but don't retry
    return { code: 'UNKNOWN', shouldFallback: true, shouldRetry: false };
}

/**
 * Get provider order from environment or default
 */
export function getProviderOrder(): LLMProvider[] {
    const envOrder = process.env.AGENT_PROVIDER_ORDER;
    if (envOrder) {
        const providers = envOrder.split(',').map(p => p.trim().toLowerCase()) as LLMProvider[];
        // Filter to only valid providers
        return providers.filter(p => ['openai', 'anthropic', 'gemini', 'xai'].includes(p));
    }
    return DEFAULTS.providerOrder;
}

/**
 * Get cooldown seconds from environment or default
 */
export function getCooldownSeconds(): number {
    const envCooldown = process.env.AGENT_PROVIDER_COOLDOWN_SECONDS;
    if (envCooldown) {
        const parsed = parseInt(envCooldown, 10);
        if (!isNaN(parsed) && parsed > 0) {
            return parsed;
        }
    }
    return DEFAULTS.cooldownSeconds;
}

/**
 * Determine the default provider based on AGENT_PROVIDER_ORDER + available API keys
 */
export function getDefaultProvider(): LLMProvider {
    const order = getProviderOrder();
    for (const provider of order) {
        if (getApiKey(provider)) {
            return provider;
        }
    }
    return 'openai'; // fallback, will fail with MISSING_API_KEY
}

/**
 * Get API key from environment
 */
export function getApiKey(provider: LLMProvider): string | undefined {
    switch (provider) {
        case 'openai':
            return process.env.OPENAI_API_KEY;
        case 'anthropic':
            return process.env.ANTHROPIC_API_KEY;
        case 'gemini':
            return process.env.GEMINI_API_KEY;
        case 'xai':
            return process.env.XAI_API_KEY;
        default:
            return undefined;
    }
}

/**
 * Get effective xAI model (from env or default)
 */
export function getEffectiveXaiModel(): { model: string; fromEnv: boolean } {
    const envModel = process.env.XAI_MODEL;
    if (envModel && envModel.trim()) {
        return { model: envModel.trim(), fromEnv: true };
    }
    return { model: DEFAULTS.xaiModel, fromEnv: false };
}

/**
 * Get effective xAI base URL (from env or default)
 */
export function getEffectiveXaiBaseUrl(): string {
    return process.env.XAI_BASE_URL || DEFAULTS.xaiBaseUrl;
}

/**
 * Get default model for provider
 */
function getDefaultModel(provider: LLMProvider): string {
    switch (provider) {
        case 'openai':
            return process.env.OPENAI_MODEL || DEFAULTS.openaiModel;
        case 'anthropic':
            return DEFAULTS.anthropicModel;
        case 'gemini':
            return process.env.GEMINI_MODEL || DEFAULTS.geminiModel;
        case 'xai':
            return getEffectiveXaiModel().model;
        default:
            return DEFAULTS.openaiModel;
    }
}

/**
 * Get API endpoint for provider (without API key for logging safety)
 */
function getApiEndpoint(provider: LLMProvider, model?: string): string {
    switch (provider) {
        case 'openai':
            return 'https://api.openai.com/v1/chat/completions';
        case 'anthropic':
            return 'https://api.anthropic.com/v1/messages';
        case 'gemini': {
            const geminiModel = model || DEFAULTS.geminiModel;
            return `https://generativelanguage.googleapis.com/v1beta/models/${geminiModel}:generateContent`;
        }
        case 'xai': {
            const baseUrl = getEffectiveXaiBaseUrl();
            return `${baseUrl}/chat/completions`;
        }
        default:
            throw new Error(`Unknown provider: ${provider}`);
    }
}

/**
 * Build request body for OpenAI (also works for xAI)
 */
function buildOpenAIRequest(
    systemPrompt: string,
    userMessage: string,
    model: string,
    maxTokens: number,
    temperature: number
): object {
    return {
        model,
        max_tokens: maxTokens,
        temperature,
        messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: userMessage },
        ],
    };
}

/**
 * Build request body for Anthropic
 */
function buildAnthropicRequest(
    systemPrompt: string,
    userMessage: string,
    model: string,
    maxTokens: number,
    temperature: number
): object {
    return {
        model: model.startsWith('claude') ? model : 'claude-3-haiku-20240307',
        max_tokens: maxTokens,
        temperature,
        system: systemPrompt,
        messages: [
            { role: 'user', content: userMessage },
        ],
    };
}

/**
 * Build request body for Gemini
 * Gemini uses a different format: system_instruction + contents
 */
function buildGeminiRequest(
    systemPrompt: string,
    userMessage: string,
    maxTokens: number,
    temperature: number
): object {
    return {
        system_instruction: {
            parts: [{ text: systemPrompt }],
        },
        contents: [
            {
                role: 'user',
                parts: [{ text: userMessage }],
            },
        ],
        generationConfig: {
            maxOutputTokens: maxTokens,
            temperature,
        },
    };
}

/**
 * Extract text from OpenAI response (also works for xAI)
 */
function extractOpenAIText(data: { choices?: Array<{ message?: { content?: string } }> }): string {
    return data.choices?.[0]?.message?.content || '';
}

/**
 * Extract text from Anthropic response
 */
function extractAnthropicText(data: { content?: Array<{ text?: string }> }): string {
    return data.content?.[0]?.text || '';
}

/**
 * Extract text from Gemini response
 */
function extractGeminiText(data: { candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }> }): string {
    return data.candidates?.[0]?.content?.parts?.[0]?.text || '';
}

/**
 * Mark a provider as in cooldown
 */
export function setCooldown(provider: LLMProvider): void {
    const cooldownSeconds = getCooldownSeconds();
    cooldownUntil[provider] = Date.now() + (cooldownSeconds * 1000);
    console.log(`[AgentRunner] Provider ${provider} in cooldown for ${cooldownSeconds}s`);
}

/**
 * Check if a provider is currently in cooldown
 */
export function isInCooldown(provider: LLMProvider): boolean {
    const expiry = cooldownUntil[provider];
    if (!expiry) return false;
    return Date.now() < expiry;
}

/**
 * Clear cooldown for a provider (for testing)
 */
export function clearCooldown(provider: LLMProvider): void {
    delete cooldownUntil[provider];
}

/**
 * Clear all cooldowns (for testing)
 */
export function clearAllCooldowns(): void {
    for (const key of Object.keys(cooldownUntil) as LLMProvider[]) {
        delete cooldownUntil[key];
    }
}

/**
 * Sleep for a specified number of milliseconds
 */
function sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Calculate retry delay with exponential backoff + jitter
 */
function getRetryDelay(attempt: number): number {
    const baseDelay = DEFAULTS.retryBaseDelayMs;
    const exponentialDelay = baseDelay * Math.pow(2, attempt);
    const jitter = Math.random() * 100; // 0-100ms jitter
    return exponentialDelay + jitter;
}

/**
 * Parse error text to extract message preview (first 200 chars, no secrets)
 */
function extractMessagePreview(errorText: string, _provider: LLMProvider): string {
    try {
        const parsed = JSON.parse(errorText);
        if (parsed.error?.message) {
            return parsed.error.message.slice(0, 200);
        }
        if (parsed.error) {
            return JSON.stringify(parsed.error).slice(0, 200);
        }
    } catch {
        // Not JSON, use raw text
    }
    return errorText.slice(0, 200);
}

/**
 * Make a single HTTP request to a provider
 */
async function makeProviderRequest(
    provider: LLMProvider,
    endpoint: string,
    headers: Record<string, string>,
    requestBody: object,
    timeoutMs: number
): Promise<{ success: boolean; text?: string; httpStatus?: number; errorText?: string }> {
    try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

        const response = await fetch(endpoint, {
            method: 'POST',
            headers,
            body: JSON.stringify(requestBody),
            signal: controller.signal,
        });

        clearTimeout(timeoutId);

        if (!response.ok) {
            const errorText = await response.text();
            return { success: false, httpStatus: response.status, errorText };
        }

        const data = await response.json();
        let text: string;

        if (provider === 'openai' || provider === 'xai') {
            text = extractOpenAIText(data);
        } else if (provider === 'anthropic') {
            text = extractAnthropicText(data);
        } else {
            text = extractGeminiText(data);
        }

        return { success: true, text };
    } catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown error';
        return { success: false, errorText: message };
    }
}

/**
 * Call a single provider with retry logic for 429/503
 */
async function callProvider(
    provider: LLMProvider,
    systemPrompt: string,
    userMessage: string,
    model: string,
    maxTokens: number,
    temperature: number,
    timeoutMs: number,
    apiKey: string
): Promise<{ success: boolean; text?: string; httpStatus?: number; errorText?: string; retries?: number }> {
    // Build request
    const endpoint = getApiEndpoint(provider, model);
    let requestBody: object;

    if (provider === 'openai' || provider === 'xai') {
        requestBody = buildOpenAIRequest(systemPrompt, userMessage, model, maxTokens, temperature);
    } else if (provider === 'anthropic') {
        requestBody = buildAnthropicRequest(systemPrompt, userMessage, model, maxTokens, temperature);
    } else {
        requestBody = buildGeminiRequest(systemPrompt, userMessage, maxTokens, temperature);
    }

    // Build headers (NO LOGGING of headers - they contain secrets)
    const headers: Record<string, string> = {
        'Content-Type': 'application/json',
    };

    if (provider === 'openai' || provider === 'xai') {
        headers['Authorization'] = `Bearer ${apiKey}`;
    } else if (provider === 'anthropic') {
        headers['x-api-key'] = apiKey;
        headers['anthropic-version'] = '2023-06-01';
    }
    // Gemini uses API key in URL query param, not headers

    // Build final URL (Gemini needs API key in query string)
    // DO NOT LOG THIS URL - it contains the API key
    const finalUrl = provider === 'gemini'
        ? `${endpoint}?key=${apiKey}`
        : endpoint;

    // Calculate per-request timeout considering retries
    const perRequestTimeout = Math.min(timeoutMs / (DEFAULTS.maxRetries + 1), 15000);

    let lastResult: { success: boolean; text?: string; httpStatus?: number; errorText?: string } | null = null;
    let retries = 0;

    for (let attempt = 0; attempt <= DEFAULTS.maxRetries; attempt++) {
        const result = await makeProviderRequest(provider, finalUrl, headers, requestBody, perRequestTimeout);

        if (result.success) {
            return { ...result, retries };
        }

        lastResult = result;

        // Check if we should retry
        const classification = classifyProviderError(result.httpStatus || 0, result.errorText || '');

        if (!classification.shouldRetry || attempt >= DEFAULTS.maxRetries) {
            break;
        }

        // Retry with exponential backoff
        const delay = getRetryDelay(attempt);
        console.log(`[AgentRunner] Provider ${provider} returned ${result.httpStatus}, retrying in ${Math.round(delay)}ms (attempt ${attempt + 1}/${DEFAULTS.maxRetries})`);
        await sleep(delay);
        retries++;
    }

    return { ...(lastResult || { success: false, errorText: 'Unknown error' }), retries };
}

/**
 * Map error classification code to result errorCode
 */
function mapErrorCodeToResultCode(code: ProviderErrorCode, anyRateLimited: boolean): string {
    // Per spec: only return QUOTA_OR_RATE_LIMIT if quota/rate-limit, else PROVIDER_FAILED
    switch (code) {
        case 'QUOTA':
        case 'RATE_LIMIT':
            return 'QUOTA_OR_RATE_LIMIT';
        default:
            // If any provider was rate limited, use that as the final error code
            return anyRateLimited ? 'QUOTA_OR_RATE_LIMIT' : 'PROVIDER_FAILED';
    }
}

/**
 * Run the agent with a user message (with multi-provider fallback).
 * 
 * This function:
 * 1. Builds the system prompt with rules and skills injection
 * 2. Tries providers in order until one succeeds
 * 3. Falls back on auth/quota/rate-limit/server errors
 * 4. Retries 429/503 with exponential backoff
 * 5. Returns the response with full diagnostics
 * 
 * @param userMessage - The user's input message
 * @param opts - Optional configuration
 * @returns AgentRunResult with success/failure and response text
 */
export async function runAgent(
    userMessage: string,
    opts: AgentRunOptions = {}
): Promise<AgentRunResult> {
    // Build system prompt with rules and skills injection
    const systemPrompt = buildSystemPrompt();
    const skillsBundle = loadSkillsBundle();
    const rulesBundle = loadRulesBundle();

    // Verify skills are injected
    if (!systemPrompt.includes(SKILLS_BLOCK_START) || !systemPrompt.includes(SKILLS_BLOCK_END)) {
        console.error('[AgentRunner] Skills block not found in system prompt');
        return {
            success: false,
            errorCode: 'SKILLS_NOT_INJECTED',
            error: 'Skills block not found in system prompt',
        };
    }

    // Verify rules are injected
    if (!systemPrompt.includes(RULES_BLOCK_START) || !systemPrompt.includes(RULES_BLOCK_END)) {
        console.error('[AgentRunner] Rules block not found in system prompt');
        return {
            success: false,
            errorCode: 'RULES_NOT_INJECTED',
            error: 'Rules block not found in system prompt',
        };
    }

    const maxTokens = opts.maxTokens || DEFAULTS.maxTokens;
    const temperature = opts.temperature || DEFAULTS.temperature;
    const timeoutMs = opts.timeoutMs || DEFAULTS.timeoutMs;

    // Determine candidate providers
    let candidateProviders: LLMProvider[];
    let allowFallback: boolean;

    if (opts.provider) {
        // Specific provider requested
        candidateProviders = [opts.provider];
        // Only fallback if explicitly allowed OR if allowFallback not explicitly set to false
        // Default to true for fallback when provider specified
        allowFallback = opts.allowFallback !== false;

        if (allowFallback) {
            // Add other providers with keys as fallbacks
            const otherProviders = getProviderOrder().filter(p => p !== opts.provider && getApiKey(p));
            candidateProviders = [...candidateProviders, ...otherProviders];
        }
    } else {
        // Use provider order, filtered to those with keys set
        candidateProviders = getProviderOrder().filter(p => getApiKey(p));
        allowFallback = true;
    }

    // If no providers have keys, return error
    if (candidateProviders.length === 0) {
        console.error('[AgentRunner] No API keys configured for any provider');
        return {
            success: false,
            errorCode: 'MISSING_API_KEY',
            error: 'No API keys configured for any provider',
        };
    }

    const attemptedProviders: LLMProvider[] = [];
    const providerErrors: ProviderErrorInfo[] = [];
    const cooldownProviders: LLMProvider[] = [];
    let anyRateLimited = false;

    for (const provider of candidateProviders) {
        // Check cooldown
        if (isInCooldown(provider)) {
            console.log(`[AgentRunner] Skipping ${provider} - in cooldown`);
            cooldownProviders.push(provider);
            continue;
        }

        const apiKey = getApiKey(provider);
        if (!apiKey) {
            // Shouldn't happen since we filtered, but just in case
            continue;
        }

        const model = opts.model || getDefaultModel(provider);

        // Log for proof (NO SECRETS - no URL, no headers, no body)
        console.log(`[AgentRunner] Trying provider=${provider} model=${model}`);
        console.log(`[AgentRunner] Skills injected: count=${skillsBundle.skillCount} bundleSha256=${skillsBundle.bundleSha256}`);
        console.log(`[AgentRunner] Rules injected: count=${rulesBundle.ruleCount} bundleSha256=${rulesBundle.bundleSha256}`);

        attemptedProviders.push(provider);

        const result = await callProvider(
            provider,
            systemPrompt,
            userMessage,
            model,
            maxTokens,
            temperature,
            timeoutMs,
            apiKey
        );

        if (result.success && result.text !== undefined) {
            console.log(`[AgentRunner] Success with ${provider}: response length=${result.text.length} chars`);

            return {
                success: true,
                text: result.text,
                metadata: {
                    model,
                    provider,
                    promptLength: systemPrompt.length,
                    bundleSha256: skillsBundle.bundleSha256,
                    skillsCount: skillsBundle.skillCount,
                    rulesBundleSha256: rulesBundle.bundleSha256,
                    rulesCount: rulesBundle.ruleCount,
                    attemptedProviders,
                    providerErrors,
                    cooldownProviders,
                },
            };
        }

        // Classify the error
        const errorText = result.errorText || '';
        const httpStatus = result.httpStatus || 0;
        const classification = classifyProviderError(httpStatus, errorText);

        // Track if any provider hit rate limit
        if (classification.code === 'RATE_LIMIT' || classification.code === 'QUOTA') {
            anyRateLimited = true;
        }

        // Build provider error info
        const errorInfo: ProviderErrorInfo = {
            provider,
            status: httpStatus || undefined,
            code: classification.code,
            messagePreview: extractMessagePreview(errorText, provider),
        };
        providerErrors.push(errorInfo);

        console.log(`[AgentRunner] Provider ${provider} failed: HTTP ${httpStatus}, code=${classification.code}, shouldFallback=${classification.shouldFallback}`);

        // Put provider in cooldown if it's a quota/rate-limit error
        if (classification.code === 'QUOTA' || classification.code === 'RATE_LIMIT') {
            setCooldown(provider);
        }

        // Check if we should try the next provider
        if (!classification.shouldFallback || !allowFallback) {
            // Don't fallback - return error immediately
            return {
                success: false,
                errorCode: mapErrorCodeToResultCode(classification.code, anyRateLimited),
                error: `Provider ${provider} returned ${httpStatus}`,
                metadata: {
                    model,
                    provider,
                    promptLength: systemPrompt.length,
                    bundleSha256: skillsBundle.bundleSha256,
                    skillsCount: skillsBundle.skillCount,
                    rulesBundleSha256: rulesBundle.bundleSha256,
                    rulesCount: rulesBundle.ruleCount,
                    attemptedProviders,
                    providerErrors,
                    cooldownProviders,
                },
            };
        }

        // Continue to next provider...
    }

    // All providers exhausted
    // If no providers were actually attempted, return MISSING_API_KEY
    if (attemptedProviders.length === 0) {
        const requestedProvider = opts.provider || candidateProviders[0] || 'openai';
        return {
            success: false,
            errorCode: 'MISSING_API_KEY',
            error: `No API key configured for ${requestedProvider}`,
            metadata: {
                model: opts.model || getDefaultModel(requestedProvider),
                provider: requestedProvider,
                promptLength: systemPrompt.length,
                bundleSha256: skillsBundle.bundleSha256,
                skillsCount: skillsBundle.skillCount,
                rulesBundleSha256: rulesBundle.bundleSha256,
                rulesCount: rulesBundle.ruleCount,
                attemptedProviders,
                providerErrors,
                cooldownProviders,
            },
        };
    }

    const lastError = providerErrors[providerErrors.length - 1];
    const lastProvider = lastError?.provider || candidateProviders[candidateProviders.length - 1];
    const model = opts.model || getDefaultModel(lastProvider);

    // Determine the appropriate error code based on the last error
    let finalErrorCode = 'PROVIDER_FAILED';
    if (anyRateLimited) {
        finalErrorCode = 'QUOTA_OR_RATE_LIMIT';
    } else if (lastError?.code) {
        finalErrorCode = mapErrorCodeToResultCode(lastError.code as ProviderErrorCode, anyRateLimited);
    }

    return {
        success: false,
        errorCode: finalErrorCode,
        error: `All providers failed. Attempted: ${attemptedProviders.join(', ')}`,
        metadata: {
            model,
            provider: lastProvider,
            promptLength: systemPrompt.length,
            bundleSha256: skillsBundle.bundleSha256,
            skillsCount: skillsBundle.skillCount,
            rulesBundleSha256: rulesBundle.bundleSha256,
            rulesCount: rulesBundle.ruleCount,
            attemptedProviders,
            providerErrors,
            cooldownProviders,
        },
    };
}

/**
 * Get the system prompt for testing/verification purposes.
 * DO NOT expose in production APIs.
 */
export function getAgentSystemPrompt(): string {
    return buildSystemPrompt();
}

/**
 * Check provider health (for dev diagnostics)
 * Returns status for each configured provider
 */
export async function checkProviderHealth(): Promise<Record<LLMProvider, { available: boolean; inCooldown: boolean }>> {
    const providers: LLMProvider[] = ['xai', 'openai', 'gemini', 'anthropic'];
    const result: Record<LLMProvider, { available: boolean; inCooldown: boolean }> = {} as Record<LLMProvider, { available: boolean; inCooldown: boolean }>;

    for (const provider of providers) {
        result[provider] = {
            available: !!getApiKey(provider),
            inCooldown: isInCooldown(provider),
        };
    }

    return result;
}
