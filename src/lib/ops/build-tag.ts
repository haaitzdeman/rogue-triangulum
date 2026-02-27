/**
 * Deployment sentinel — imported by health and build-info routes.
 *
 * When this file changes, the server bundle MUST change, forcing
 * a different build artifact even if Vercel tries to cache.
 *
 * Bump OPS_BUILD_TAG on every deploy-critical commit.
 */

export const OPS_BUILD_TAG = '2026-02-27-phase3-v1';
export const OPS_BUILD_TIMESTAMP = '2026-02-27T01:50:28Z';
