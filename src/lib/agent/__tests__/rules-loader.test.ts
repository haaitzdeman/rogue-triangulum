/**
 * Rules Loader Tests
 */

import { loadRulesBundle, getRulesMetadata, clearRulesCache } from '../rules-loader';

beforeEach(() => {
    clearRulesCache();
});

describe('RulesLoader', () => {
    describe('loadRulesBundle', () => {
        it('should load all rule files from rules directory', () => {
            const bundle = loadRulesBundle();

            expect(bundle.ruleCount).toBeGreaterThan(0);
            expect(bundle.rules.length).toBe(bundle.ruleCount);
            expect(bundle.bundleSha256).toBeDefined();
            expect(bundle.bundleSha256.length).toBe(64); // SHA256 hex length
            expect(bundle.bundleText).toContain('# RULES BUNDLE');
        });

        it('should load exactly 6 rules', () => {
            const bundle = loadRulesBundle();

            expect(bundle.ruleCount).toBe(6);
        });

        it('should have rules in alphabetical order', () => {
            const bundle = loadRulesBundle();

            const names = bundle.rules.map(r => r.name);
            const sortedNames = [...names].sort();

            expect(names).toEqual(sortedNames);
        });

        it('should include expected rule names', () => {
            const bundle = loadRulesBundle();

            const names = bundle.rules.map(r => r.name);

            expect(names).toContain('00-truthfulness');
            expect(names).toContain('01-no-lookahead');
            expect(names).toContain('02-execution-safety');
            expect(names).toContain('03-no-secrets');
            expect(names).toContain('04-proof-pack-format');
            expect(names).toContain('05-conversation-discipline');
        });

        it('should have SHA256 for each rule', () => {
            const bundle = loadRulesBundle();

            for (const rule of bundle.rules) {
                expect(rule.sha256).toBeDefined();
                expect(rule.sha256.length).toBe(64);
            }
        });

        it('should include rule text for each rule', () => {
            const bundle = loadRulesBundle();

            for (const rule of bundle.rules) {
                expect(rule.text).toBeDefined();
                expect(rule.text.length).toBeGreaterThan(0);
            }
        });

        it('should format bundleText with rule headers', () => {
            const bundle = loadRulesBundle();

            expect(bundle.bundleText).toContain('## 00-truthfulness');
            expect(bundle.bundleText).toContain('## 05-conversation-discipline');
        });

        it('should use cache on second call', () => {
            const bundle1 = loadRulesBundle();
            const bundle2 = loadRulesBundle();

            // Same reference means cache was used
            expect(bundle1).toBe(bundle2);
        });

        it('should throw on missing rules directory', () => {
            expect(() => {
                loadRulesBundle('/nonexistent/path');
            }).toThrow('Rules directory not found');
        });
    });

    describe('getRulesMetadata', () => {
        it('should return metadata without full text', () => {
            const metadata = getRulesMetadata();

            expect(metadata.ruleCount).toBe(6);
            expect(metadata.bundleSha256).toBeDefined();
            expect(metadata.rules.length).toBe(6);

            for (const rule of metadata.rules) {
                expect(rule.name).toBeDefined();
                expect(rule.sha256).toBeDefined();
                // Should NOT have text property
                expect((rule as { text?: string }).text).toBeUndefined();
            }
        });
    });
});
