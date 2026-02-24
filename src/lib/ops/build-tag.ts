/**
 * Deployment sentinel — imported by health and build-info routes.
 *
 * When this file changes, the server bundle MUST change, forcing
 * a different build artifact even if Vercel tries to cache.
 *
 * Bump OPS_BUILD_TAG on every deploy-critical commit.
 */

export const OPS_BUILD_TAG = '2026-02-24-deploy-proof-v3';
export const OPS_BUILD_TIMESTAMP = '2026-02-24T04:11:00Z';
