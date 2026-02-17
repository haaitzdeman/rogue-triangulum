/**
 * Brain Boundary Enforcement Tests
 *
 * Ensures desk brains don't cross-import each other's decision layers.
 * Run with: npx jest boundary-enforcement
 */

import * as fs from 'fs';
import * as path from 'path';

const SRC_ROOT = path.join(__dirname, '..', '..', '..');

// =============================================================================
// Helpers
// =============================================================================

/**
 * Recursively find all .ts files in a directory (excluding __tests__)
 */
function findTsFiles(dir: string): string[] {
    if (!fs.existsSync(dir)) return [];
    const results: string[] = [];
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
        const fullPath = path.join(dir, entry.name);
        if (entry.isDirectory()) {
            if (entry.name !== '__tests__' && entry.name !== 'node_modules') {
                results.push(...findTsFiles(fullPath));
            }
        } else if (entry.name.endsWith('.ts') && !entry.name.endsWith('.test.ts')) {
            results.push(fullPath);
        }
    }
    return results;
}

/**
 * Check if a file's contents contain an import from a given path pattern
 */
function fileImportsFrom(filePath: string, importPattern: string): boolean {
    const content = fs.readFileSync(filePath, 'utf-8');
    return content.includes(importPattern);
}

// =============================================================================
// Premarket ↔ Options Boundary
// =============================================================================

describe('Desk brain boundaries', () => {
    it('premarket files must NOT import options decision layer', () => {
        const premarketDir = path.join(SRC_ROOT, 'lib', 'premarket');
        const files = findTsFiles(premarketDir);

        for (const file of files) {
            const violates = fileImportsFrom(file, 'options/options-decision-layer')
                || fileImportsFrom(file, 'brains/options');
            if (violates) {
                fail(`${path.relative(SRC_ROOT, file)} imports options decision layer — boundary violation`);
            }
        }
    });

    it('options files must NOT import premarket decision layer', () => {
        const optionsDir = path.join(SRC_ROOT, 'lib', 'options');
        const files = findTsFiles(optionsDir);

        for (const file of files) {
            const violates = fileImportsFrom(file, 'premarket/decision-layer')
                || fileImportsFrom(file, 'brains/premarket');
            if (violates) {
                fail(`${path.relative(SRC_ROOT, file)} imports premarket decision layer — boundary violation`);
            }
        }
    });

    it('coordinator must NOT import decision layers directly', () => {
        const coordinatorFiles = [
            path.join(SRC_ROOT, 'lib', 'integration', 'opportunity-engine.ts'),
            path.join(SRC_ROOT, 'lib', 'brains', 'coordinator', 'index.ts'),
        ];

        const forbiddenPatterns = [
            'premarket/decision-layer',
            'options/options-decision-layer',
        ];

        for (const file of coordinatorFiles) {
            if (!fs.existsSync(file)) continue;
            for (const pattern of forbiddenPatterns) {
                if (fileImportsFrom(file, pattern)) {
                    fail(`${path.relative(SRC_ROOT, file)} imports ${pattern} — coordinator boundary violation`);
                }
            }
        }
    });
});

// =============================================================================
// Structure Verification
// =============================================================================

describe('Brain structure exists', () => {
    const brainDirs = [
        'premarket',
        'options',
        'coordinator',
        'swing',
        'daytrading',
    ];

    for (const brain of brainDirs) {
        it(`brains/${brain}/index.ts exists`, () => {
            const indexPath = path.join(SRC_ROOT, 'lib', 'brains', brain, 'index.ts');
            expect(fs.existsSync(indexPath)).toBe(true);
        });
    }
});
