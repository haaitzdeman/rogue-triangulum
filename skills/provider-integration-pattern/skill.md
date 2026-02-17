# Skill: Provider Integration Pattern (Retries, Cache, Plan Limits)

## Purpose
Integrate an external market data provider safely: caching, retries, consistent interfaces, and graceful handling of plan limits.

## When to Use
Use when adding or modifying any market data provider (historical bars, quotes, snapshots).

## Inputs
- API base URL
- API key (secret)
- Endpoint specs (paths, params, pagination)
- Rate limits / plan limits / history limits

## Outputs
- A provider module implementing a stable interface:
  - getDailyBars(symbol, start, end)
  - getQuote(symbol)
- Cache behavior and locations
- Explicit error taxonomy (AUTH_FAILED, PLAN_LIMITED, NETWORK, PARSE)

## Hard Rules
1) Never hardcode secrets; read from env.
2) Implement exponential backoff with jitter for transient failures.
3) Implement filesystem cache on server only; never in client bundles.
4) If provider returns less history than requested, mark:
   - dataLimited: true
   - log prefix: [plan-limited]
5) Always return sorted bars and validate schema.
6) No emojis.

## Procedure
1) Define interface: Provider { getDailyBars; getQuote }.
2) Implement request wrapper:
   - timeout
   - retry on 429/5xx/network
   - no retry on 401/403
3) Add cache keys:
   - /data/cache/bars/{symbol}_{start}_{end}.json
4) Validate:
   - required fields exist
   - timestamps monotonic
   - no duplicates
5) Add "bad key" proof path:
   - setting key to invalid triggers AUTH_FAILED with clear message.

## Acceptance Checks
- Provider works with valid key and fails clearly with invalid key.
- Cache hits reduce network calls.
- dataLimited is set when history is truncated.
