/**
 * Skills Loader Tests
 * 
 * Tests using temporary directories to avoid repo dependency.
 */

import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { loadSkillsBundle, clearSkillsCache } from '../skills-loader';

describe('SkillsLoader', () => {
    let tempDir: string;

    beforeEach(() => {
        // Create a unique temp directory for each test
        tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'skills-test-'));
        clearSkillsCache();
    });

    afterEach(() => {
        // Clean up temp directory
        if (fs.existsSync(tempDir)) {
            fs.rmSync(tempDir, { recursive: true, force: true });
        }
    });

    describe('Deterministic Ordering', () => {
        it('should return skills in alphabetical order regardless of creation order', () => {
            // Create folders in non-alphabetical order
            const folders = ['zebra-skill', 'alpha-skill', 'mike-skill', 'beta-skill'];

            for (const folder of folders) {
                const folderPath = path.join(tempDir, folder);
                fs.mkdirSync(folderPath, { recursive: true });
                fs.writeFileSync(
                    path.join(folderPath, 'skill.md'),
                    `# Skill: ${folder}\nContent for ${folder}`
                );
            }

            const bundle = loadSkillsBundle(tempDir);

            // Verify alphabetical order
            expect(bundle.skillCount).toBe(4);
            expect(bundle.skills[0].name).toBe('alpha-skill');
            expect(bundle.skills[1].name).toBe('beta-skill');
            expect(bundle.skills[2].name).toBe('mike-skill');
            expect(bundle.skills[3].name).toBe('zebra-skill');

            // Verify bundle text order
            const alphaIndex = bundle.bundleText.indexOf('alpha-skill');
            const betaIndex = bundle.bundleText.indexOf('beta-skill');
            const mikeIndex = bundle.bundleText.indexOf('mike-skill');
            const zebraIndex = bundle.bundleText.indexOf('zebra-skill');
            expect(alphaIndex).toBeLessThan(betaIndex);
            expect(betaIndex).toBeLessThan(mikeIndex);
            expect(mikeIndex).toBeLessThan(zebraIndex);
        });
    });

    describe('Missing skill.md Throws', () => {
        it('should throw error when a skill folder lacks skill.md', () => {
            // Create one valid skill folder
            const validFolder = path.join(tempDir, 'valid-skill');
            fs.mkdirSync(validFolder, { recursive: true });
            fs.writeFileSync(path.join(validFolder, 'skill.md'), '# Valid Skill');

            // Create one invalid skill folder (no skill.md)
            const invalidFolder = path.join(tempDir, 'invalid-skill');
            fs.mkdirSync(invalidFolder, { recursive: true });
            // Intentionally no skill.md file

            expect(() => loadSkillsBundle(tempDir)).toThrow(
                '[SkillsLoader] Missing skill.md in folder: invalid-skill'
            );
        });

        it('should throw error when skills directory does not exist', () => {
            const nonExistentDir = path.join(tempDir, 'does-not-exist');

            expect(() => loadSkillsBundle(nonExistentDir)).toThrow(
                `[SkillsLoader] Skills directory not found: ${nonExistentDir}`
            );
        });

        it('should throw error when skills directory is empty', () => {
            // tempDir is empty (no subdirectories)
            expect(() => loadSkillsBundle(tempDir)).toThrow(
                `[SkillsLoader] No skill folders found in: ${tempDir}`
            );
        });
    });

    describe('Hash Changes on File Change', () => {
        it('should produce different sha256 when file content changes', () => {
            // Create a skill folder
            const skillFolder = path.join(tempDir, 'hash-test-skill');
            fs.mkdirSync(skillFolder, { recursive: true });
            const skillPath = path.join(skillFolder, 'skill.md');

            // Initial content
            fs.writeFileSync(skillPath, '# Original Content\nVersion 1');
            const bundle1 = loadSkillsBundle(tempDir);
            const hash1 = bundle1.skills[0].sha256;
            const bundleHash1 = bundle1.bundleSha256;

            // Clear cache to force reload
            clearSkillsCache();

            // Modified content
            fs.writeFileSync(skillPath, '# Modified Content\nVersion 2');
            const bundle2 = loadSkillsBundle(tempDir);
            const hash2 = bundle2.skills[0].sha256;
            const bundleHash2 = bundle2.bundleSha256;

            // Hashes should differ
            expect(hash1).not.toBe(hash2);
            expect(bundleHash1).not.toBe(bundleHash2);

            // Skill name should remain the same
            expect(bundle1.skills[0].name).toBe(bundle2.skills[0].name);
        });

        it('should produce same sha256 for identical content', () => {
            // Create two skill folders with identical content
            const skill1 = path.join(tempDir, 'skill-a');
            const skill2 = path.join(tempDir, 'skill-b');
            fs.mkdirSync(skill1, { recursive: true });
            fs.mkdirSync(skill2, { recursive: true });

            const content = '# Identical Content\nSame for both';
            fs.writeFileSync(path.join(skill1, 'skill.md'), content);
            fs.writeFileSync(path.join(skill2, 'skill.md'), content);

            const bundle = loadSkillsBundle(tempDir);

            // Both skills should have the same hash (same content)
            expect(bundle.skills[0].sha256).toBe(bundle.skills[1].sha256);
        });
    });

    describe('Bundle Structure', () => {
        it('should include all required fields in bundle', () => {
            // Create a skill
            const skillFolder = path.join(tempDir, 'test-skill');
            fs.mkdirSync(skillFolder, { recursive: true });
            fs.writeFileSync(path.join(skillFolder, 'skill.md'), '# Test Skill');

            const bundle = loadSkillsBundle(tempDir);

            expect(bundle).toHaveProperty('bundleText');
            expect(bundle).toHaveProperty('skillCount');
            expect(bundle).toHaveProperty('skills');
            expect(bundle).toHaveProperty('bundleSha256');
            expect(bundle.skillCount).toBe(1);
            expect(bundle.skills).toHaveLength(1);
            expect(bundle.skills[0]).toHaveProperty('name');
            expect(bundle.skills[0]).toHaveProperty('path');
            expect(bundle.skills[0]).toHaveProperty('sha256');
        });
    });
});
