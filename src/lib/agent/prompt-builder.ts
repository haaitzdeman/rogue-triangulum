/**
 * Agent Prompt Builder
 * 
 * The SINGLE point of construction for agent system prompts.
 * All agent instructions MUST be built through this module.
 * 
 * Features:
 * - Injects rules bundle (global strict constraints) FIRST
 * - Injects skills bundle (task playbooks) AFTER rules
 * - Server-only (no client-side usage)
 * - Provides metadata for verification without exposing full prompt
 */

import { loadSkillsBundle, type SkillsBundle } from './skills-loader';
import { loadRulesBundle, type RulesBundle } from './rules-loader';

/**
 * Marker strings for rules block detection
 */
export const RULES_BLOCK_START = '----- BEGIN RULES BUNDLE (sha256:';
export const RULES_BLOCK_END = '----- END RULES BUNDLE -----';

/**
 * Marker strings for skills block detection
 */
export const SKILLS_BLOCK_START = '----- BEGIN SKILLS BUNDLE (sha256:';
export const SKILLS_BLOCK_END = '----- END SKILLS BUNDLE -----';

/**
 * Base system prompt (stub for future agent integration)
 */
const BASE_SYSTEM_PROMPT = `You are an assistant for the Rogue Triangulum trading terminal.

Your role is to help users understand market signals, calibration results, and execution safety.

Always follow the RULES (mandatory constraints) and SKILLS (task playbooks) injected below.
Rules take precedence over skills in case of conflict.
`;

/**
 * Build the complete system prompt with rules and skills injection.
 * 
 * This is the ONLY function that constructs agent prompts.
 * All agent implementations MUST use this function.
 * 
 * Order: BASE_PROMPT -> RULES -> SKILLS
 * 
 * @returns The complete system prompt with rules and skills bundles injected
 */
export function buildSystemPrompt(): string {
    const rulesBundle = loadRulesBundle();
    const skillsBundle = loadSkillsBundle();

    // Rules block comes FIRST (mandatory constraints)
    const rulesBlock = `
${RULES_BLOCK_START} ${rulesBundle.bundleSha256}) -----
${rulesBundle.bundleText}
${RULES_BLOCK_END}
`;

    // Skills block comes AFTER rules (task playbooks)
    const skillsBlock = `
${SKILLS_BLOCK_START} ${skillsBundle.bundleSha256}) -----
${skillsBundle.bundleText}
${SKILLS_BLOCK_END}
`;

    return `${BASE_SYSTEM_PROMPT}\n${rulesBlock}\n${skillsBlock}`;
}

/**
 * Metadata about the built prompt (safe to expose in dev APIs)
 */
export interface PromptMetadata {
    // Skills metadata
    injected: boolean;
    bundleSha256: string;
    skillsCount: number;
    systemPromptLength: number;
    skillsBlockPresent: boolean;
    // Rules metadata
    rulesInjected: boolean;
    ruleCount: number;
    rulesBundleSha256: string;
    rulesBlockPresent: boolean;
}

/**
 * Get metadata about the system prompt without exposing the full text.
 * Used for verification endpoints.
 * 
 * @returns PromptMetadata with injection status and verification info
 */
export function getPromptMetadata(): PromptMetadata {
    const prompt = buildSystemPrompt();
    const skillsBundle = loadSkillsBundle();
    const rulesBundle = loadRulesBundle();

    const skillsBlockPresent =
        prompt.includes(SKILLS_BLOCK_START) &&
        prompt.includes(SKILLS_BLOCK_END);

    const rulesBlockPresent =
        prompt.includes(RULES_BLOCK_START) &&
        prompt.includes(RULES_BLOCK_END);

    return {
        // Skills metadata
        injected: skillsBlockPresent && skillsBundle.skillCount > 0,
        bundleSha256: skillsBundle.bundleSha256,
        skillsCount: skillsBundle.skillCount,
        systemPromptLength: prompt.length,
        skillsBlockPresent,
        // Rules metadata
        rulesInjected: rulesBlockPresent && rulesBundle.ruleCount > 0,
        ruleCount: rulesBundle.ruleCount,
        rulesBundleSha256: rulesBundle.bundleSha256,
        rulesBlockPresent,
    };
}

/**
 * Get the skills bundle directly (for internal use only)
 * DO NOT expose bundleText in API responses
 */
export function getSkillsBundle(): SkillsBundle {
    return loadSkillsBundle();
}

/**
 * Get the rules bundle directly (for internal use only)
 * DO NOT expose bundleText in API responses
 */
export function getRulesBundle(): RulesBundle {
    return loadRulesBundle();
}
