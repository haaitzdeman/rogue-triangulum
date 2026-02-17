/**
 * Agent Prompt Builder Tests
 * 
 * Tests for rules and skills injection into system prompt.
 */

import {
    buildSystemPrompt,
    getPromptMetadata,
    SKILLS_BLOCK_START,
    SKILLS_BLOCK_END,
    RULES_BLOCK_START,
    RULES_BLOCK_END,
} from '../prompt-builder';
import { loadSkillsBundle } from '../skills-loader';
import { loadRulesBundle } from '../rules-loader';

describe('AgentPromptBuilder', () => {
    describe('buildSystemPrompt - Skills', () => {
        it('should include skills block markers', () => {
            const prompt = buildSystemPrompt();

            expect(prompt).toContain(SKILLS_BLOCK_START);
            expect(prompt).toContain(SKILLS_BLOCK_END);
        });

        it('should include skills bundleSha256 in skills block header', () => {
            const prompt = buildSystemPrompt();
            const bundle = loadSkillsBundle();

            expect(prompt).toContain(bundle.bundleSha256);
        });

        it('should have skills in alphabetical order (conversation-discipline before universe-scaling)', () => {
            const prompt = buildSystemPrompt();

            const conversationIndex = prompt.indexOf('conversation-discipline');
            const universeIndex = prompt.indexOf('universe-scaling');

            expect(conversationIndex).toBeGreaterThan(-1);
            expect(universeIndex).toBeGreaterThan(-1);
            expect(conversationIndex).toBeLessThan(universeIndex);
        });

        it('should include all 14 skills', () => {
            const prompt = buildSystemPrompt();
            const bundle = loadSkillsBundle();

            expect(bundle.skillCount).toBe(14);

            // Verify each skill name appears in the prompt
            for (const skill of bundle.skills) {
                expect(prompt).toContain(skill.name);
            }
        });
    });

    describe('buildSystemPrompt - Rules', () => {
        it('should include rules block markers', () => {
            const prompt = buildSystemPrompt();

            expect(prompt).toContain(RULES_BLOCK_START);
            expect(prompt).toContain(RULES_BLOCK_END);
        });

        it('should include rules bundleSha256 in rules block header', () => {
            const prompt = buildSystemPrompt();
            const bundle = loadRulesBundle();

            expect(prompt).toContain(bundle.bundleSha256);
        });

        it('should have rules in alphabetical order (00-truthfulness before 05-conversation-discipline)', () => {
            const prompt = buildSystemPrompt();

            const truthfulnessIndex = prompt.indexOf('00-truthfulness');
            const conversationIndex = prompt.indexOf('05-conversation-discipline');

            expect(truthfulnessIndex).toBeGreaterThan(-1);
            expect(conversationIndex).toBeGreaterThan(-1);
            expect(truthfulnessIndex).toBeLessThan(conversationIndex);
        });

        it('should include all 6 rules', () => {
            const prompt = buildSystemPrompt();
            const bundle = loadRulesBundle();

            expect(bundle.ruleCount).toBe(6);

            // Verify each rule name appears in the prompt
            for (const rule of bundle.rules) {
                expect(prompt).toContain(rule.name);
            }
        });

        it('should have RULES block BEFORE SKILLS block', () => {
            const prompt = buildSystemPrompt();

            const rulesStartIndex = prompt.indexOf(RULES_BLOCK_START);
            const rulesEndIndex = prompt.indexOf(RULES_BLOCK_END);
            const skillsStartIndex = prompt.indexOf(SKILLS_BLOCK_START);
            const skillsEndIndex = prompt.indexOf(SKILLS_BLOCK_END);

            // All markers should exist
            expect(rulesStartIndex).toBeGreaterThan(-1);
            expect(rulesEndIndex).toBeGreaterThan(-1);
            expect(skillsStartIndex).toBeGreaterThan(-1);
            expect(skillsEndIndex).toBeGreaterThan(-1);

            // Rules should come before skills
            expect(rulesStartIndex).toBeLessThan(skillsStartIndex);
            expect(rulesEndIndex).toBeLessThan(skillsStartIndex);
        });
    });

    describe('getPromptMetadata - Skills', () => {
        it('should return injected: true when skills are present', () => {
            const metadata = getPromptMetadata();

            expect(metadata.injected).toBe(true);
        });

        it('should return skillsBlockPresent: true', () => {
            const metadata = getPromptMetadata();

            expect(metadata.skillsBlockPresent).toBe(true);
        });

        it('should return correct skillsCount', () => {
            const metadata = getPromptMetadata();

            expect(metadata.skillsCount).toBe(14);
        });

        it('should return bundleSha256 matching the loaded bundle', () => {
            const metadata = getPromptMetadata();
            const bundle = loadSkillsBundle();

            expect(metadata.bundleSha256).toBe(bundle.bundleSha256);
        });

        it('should return systemPromptLength greater than zero', () => {
            const metadata = getPromptMetadata();

            expect(metadata.systemPromptLength).toBeGreaterThan(0);
        });
    });

    describe('getPromptMetadata - Rules', () => {
        it('should return rulesInjected: true when rules are present', () => {
            const metadata = getPromptMetadata();

            expect(metadata.rulesInjected).toBe(true);
        });

        it('should return rulesBlockPresent: true', () => {
            const metadata = getPromptMetadata();

            expect(metadata.rulesBlockPresent).toBe(true);
        });

        it('should return correct ruleCount', () => {
            const metadata = getPromptMetadata();

            expect(metadata.ruleCount).toBe(6);
        });

        it('should return rulesBundleSha256 matching the loaded bundle', () => {
            const metadata = getPromptMetadata();
            const bundle = loadRulesBundle();

            expect(metadata.rulesBundleSha256).toBe(bundle.bundleSha256);
        });
    });
});
