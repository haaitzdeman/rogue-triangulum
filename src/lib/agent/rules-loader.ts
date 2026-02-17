/**
 * Rules Loader
 * 
 * Loads all rule files from rules/*.md directory.
 * Rules are global, always-injected, strict constraints.
 * 
 * Features:
 * - Alphabetical ordering by filename for deterministic bundle
 * - SHA256 hash per rule + bundle hash
 * - mtime-based cache invalidation
 * - Hard fails if rules directory missing or empty
 */

import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';

/**
 * Single rule file metadata
 */
export interface RuleFile {
    name: string;
    sha256: string;
    text: string;
}

/**
 * Rules bundle containing all loaded rules
 */
export interface RulesBundle {
    ruleCount: number;
    rules: RuleFile[];
    bundleSha256: string;
    bundleText: string;
}

/**
 * Rules metadata (safe for API exposure)
 */
export interface RulesMetadata {
    ruleCount: number;
    rules: Array<{ name: string; sha256: string }>;
    bundleSha256: string;
}

/**
 * Cache entry for mtime-based invalidation
 */
interface CacheEntry {
    bundle: RulesBundle;
    mtimes: Record<string, number>;
}

let cache: CacheEntry | null = null;

/**
 * Calculate SHA256 hash of content
 */
function sha256(content: string): string {
    return crypto.createHash('sha256').update(content, 'utf8').digest('hex');
}

/**
 * Get default rules directory path
 */
function getDefaultRulesDir(): string {
    // Use process.cwd() to resolve from repo root (like skills-loader)
    return path.join(process.cwd(), 'rules');
}

/**
 * Check if cache is valid based on file mtimes
 */
function isCacheValid(rulesDir: string): boolean {
    if (!cache) return false;

    try {
        const files = fs.readdirSync(rulesDir)
            .filter(f => f.endsWith('.md'))
            .sort();

        // Build current file paths
        const currentFilePaths = files.map(f => path.join(rulesDir, f));

        // Check if file list changed
        const cachedFilePaths = Object.keys(cache.mtimes).sort();
        if (currentFilePaths.length !== cachedFilePaths.length) return false;

        for (let i = 0; i < currentFilePaths.length; i++) {
            const filePath = currentFilePaths[i];

            // Check path match
            if (filePath !== cachedFilePaths[i]) return false;

            // Check mtime match
            const stat = fs.statSync(filePath);
            if (stat.mtimeMs !== cache.mtimes[filePath]) return false;
        }

        return true;
    } catch {
        return false;
    }
}

/**
 * Load all rules from the rules directory
 * 
 * @param rulesDir - Optional path to rules directory (defaults to repo root /rules)
 * @returns RulesBundle containing all rules
 * @throws Error if rules directory doesn't exist or is empty
 */
export function loadRulesBundle(rulesDir?: string): RulesBundle {
    const dir = rulesDir || getDefaultRulesDir();

    // Check cache first
    if (isCacheValid(dir) && cache) {
        console.log('[RulesLoader] Cache hit');
        return cache.bundle;
    }

    console.log('[RulesLoader] Loading rules from:', dir);

    // Verify directory exists
    if (!fs.existsSync(dir)) {
        throw new Error(`Rules directory not found: ${dir}. Rules are mandatory.`);
    }

    // Get all .md files in rules directory
    const files = fs.readdirSync(dir)
        .filter(f => f.endsWith('.md'))
        .sort(); // Alphabetical order for determinism

    // Hard fail if no rules
    if (files.length === 0) {
        throw new Error(`No rule files found in ${dir}. Rules are mandatory.`);
    }

    const rules: RuleFile[] = [];
    const mtimes: Record<string, number> = {};
    const bundleParts: string[] = ['# RULES BUNDLE\n'];

    for (const file of files) {
        const filePath = path.join(dir, file);
        const stat = fs.statSync(filePath);
        mtimes[filePath] = stat.mtimeMs;

        const content = fs.readFileSync(filePath, 'utf8');
        const ruleName = file.replace(/\.md$/, '');

        rules.push({
            name: ruleName,
            sha256: sha256(content),
            text: content,
        });

        // Add to bundle text
        bundleParts.push(`\n## ${ruleName}\n`);
        bundleParts.push(content);
        bundleParts.push('\n');
    }

    const bundleText = bundleParts.join('');

    const bundle: RulesBundle = {
        ruleCount: rules.length,
        rules,
        bundleSha256: sha256(bundleText),
        bundleText,
    };

    // Update cache
    cache = { bundle, mtimes };

    console.log(`[RulesLoader] Loaded ${rules.length} rules, bundleSha256=${bundle.bundleSha256.slice(0, 16)}...`);

    return bundle;
}

/**
 * Get rules metadata (safe for API exposure - no full text)
 */
export function getRulesMetadata(rulesDir?: string): RulesMetadata {
    const bundle = loadRulesBundle(rulesDir);

    return {
        ruleCount: bundle.ruleCount,
        rules: bundle.rules.map(r => ({ name: r.name, sha256: r.sha256 })),
        bundleSha256: bundle.bundleSha256,
    };
}

/**
 * Clear the cache (for testing)
 */
export function clearRulesCache(): void {
    cache = null;
}
