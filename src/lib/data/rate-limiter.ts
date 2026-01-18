/**
 * Rate Limiter for API calls
 * 
 * Implements token bucket algorithm to enforce rate limits.
 * Polygon.io free tier: 5 calls per minute
 */

export class RateLimiter {
    private tokens: number;
    private lastRefill: number;
    private readonly maxTokens: number;
    private readonly refillRate: number; // tokens per second

    constructor(callsPerMinute: number = 5) {
        this.maxTokens = callsPerMinute;
        this.tokens = callsPerMinute;
        this.refillRate = callsPerMinute / 60; // Convert to per-second
        this.lastRefill = Date.now();
    }

    /**
     * Refills tokens based on time elapsed
     */
    private refill(): void {
        const now = Date.now();
        const elapsed = (now - this.lastRefill) / 1000; // seconds
        const tokensToAdd = elapsed * this.refillRate;

        this.tokens = Math.min(this.maxTokens, this.tokens + tokensToAdd);
        this.lastRefill = now;
    }

    /**
     * Attempts to acquire a token for making an API call
     * @returns true if token acquired, false if rate limited
     */
    tryAcquire(): boolean {
        this.refill();

        if (this.tokens >= 1) {
            this.tokens -= 1;
            return true;
        }

        return false;
    }

    /**
     * Waits until a token is available
     * @returns Promise that resolves when token is acquired
     */
    async acquire(): Promise<void> {
        this.refill();

        if (this.tokens >= 1) {
            this.tokens -= 1;
            return;
        }

        // Calculate wait time for next token
        const tokensNeeded = 1 - this.tokens;
        const waitSeconds = tokensNeeded / this.refillRate;
        const waitMs = Math.ceil(waitSeconds * 1000);

        await new Promise(resolve => setTimeout(resolve, waitMs));
        this.tokens = 0; // We consumed the token we waited for
    }

    /**
     * Returns time until next token is available (in seconds)
     */
    getWaitTime(): number {
        this.refill();

        if (this.tokens >= 1) {
            return 0;
        }

        const tokensNeeded = 1 - this.tokens;
        return tokensNeeded / this.refillRate;
    }

    /**
     * Current available tokens
     */
    getAvailableTokens(): number {
        this.refill();
        return Math.floor(this.tokens);
    }

    /**
     * Reset the rate limiter (e.g., after API key change)
     */
    reset(): void {
        this.tokens = this.maxTokens;
        this.lastRefill = Date.now();
    }
}

// Singleton instance for global rate limiting
let globalRateLimiter: RateLimiter | null = null;

export function getGlobalRateLimiter(callsPerMinute: number = 5): RateLimiter {
    if (!globalRateLimiter) {
        globalRateLimiter = new RateLimiter(callsPerMinute);
    }
    return globalRateLimiter;
}

export function resetGlobalRateLimiter(): void {
    globalRateLimiter = null;
}
