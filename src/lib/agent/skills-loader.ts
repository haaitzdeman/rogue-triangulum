/**
 * Skills Loader
 * 
 * Server-side loader that reads all skills/{folder}/skill.md files,
 * concatenates them into a single bundle, and provides metadata.
 * 
 * Features:
 * - Deterministic alphabetical ordering by folder name
 * - SHA256 hashing per skill and for entire bundle
 * - Hard failure if any skill folder lacks skill.md
 * - In-memory cache with mtime-based invalidation
 * - Server-only (no client-side fs usage)
 */

import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';

// Configuration
const SKILLS_DIR = path.join(process.cwd(), 'skills');

/**
 * Skill metadata
 */
export interface SkillInfo {
    name: string;       // folder name
    path: string;       // absolute path to skill.md
    sha256: string;     // hash of file content
}

/**
 * Skills bundle result
 */
export interface SkillsBundle {
    bundleText: string;
    skillCount: number;
    skills: SkillInfo[];
    bundleSha256: string;
}

/**
 * Cache entry with mtime tracking
 */
interface CacheEntry {
    bundle: SkillsBundle;
    mtimes: Map<string, number>; // path -> mtime
}

// In-memory cache
let cache: CacheEntry | null = null;

/**
 * Compute SHA256 hash of a string
 */
function sha256(content: string): string {
    return crypto.createHash('sha256').update(content, 'utf8').digest('hex');
}

/**
 * Check if cache is still valid by comparing mtimes
 */
function isCacheValid(skillsDir: string): boolean {
    if (!cache) {
        return false;
    }

    try {
        const folders = fs.readdirSync(skillsDir, { withFileTypes: true })
            .filter(d => d.isDirectory())
            .map(d => d.name)
            .sort();

        // Different folder count means cache is invalid
        if (folders.length !== cache.mtimes.size) {
            return false;
        }

        // Check each skill.md mtime
        for (const folder of folders) {
            const skillPath = path.join(skillsDir, folder, 'skill.md');
            if (!fs.existsSync(skillPath)) {
                return false;
            }

            const stat = fs.statSync(skillPath);
            const cachedMtime = cache.mtimes.get(skillPath);
            if (cachedMtime !== stat.mtimeMs) {
                return false;
            }
        }

        return true;
    } catch {
        return false;
    }
}

/**
 * Load all skills from disk and bundle them.
 * 
 * @param skillsDir - Optional custom skills directory (for testing)
 * @returns SkillsBundle with all skill content and metadata
 * @throws Error if a skill folder lacks skill.md
 */
export function loadSkillsBundle(skillsDir: string = SKILLS_DIR): SkillsBundle {
    // Check cache first (only for default directory)
    if (skillsDir === SKILLS_DIR && isCacheValid(skillsDir)) {
        console.log('[SkillsLoader] Cache hit');
        return cache!.bundle;
    }

    console.log(`[SkillsLoader] Loading skills from ${skillsDir}`);

    // Verify skills directory exists
    if (!fs.existsSync(skillsDir)) {
        throw new Error(`[SkillsLoader] Skills directory not found: ${skillsDir}`);
    }

    // Get all subdirectories, sorted alphabetically for determinism
    const folders = fs.readdirSync(skillsDir, { withFileTypes: true })
        .filter(d => d.isDirectory())
        .map(d => d.name)
        .sort();

    if (folders.length === 0) {
        throw new Error(`[SkillsLoader] No skill folders found in: ${skillsDir}`);
    }

    const skills: SkillInfo[] = [];
    const bundleParts: string[] = [];
    const mtimes = new Map<string, number>();

    for (const folder of folders) {
        const skillPath = path.join(skillsDir, folder, 'skill.md');

        // HARD FAILURE: skill.md must exist
        if (!fs.existsSync(skillPath)) {
            throw new Error(`[SkillsLoader] Missing skill.md in folder: ${folder}`);
        }

        // Read content
        const content = fs.readFileSync(skillPath, 'utf8');
        const hash = sha256(content);

        // Track mtime for cache invalidation
        const stat = fs.statSync(skillPath);
        mtimes.set(skillPath, stat.mtimeMs);

        // Add to skills list
        skills.push({
            name: folder,
            path: skillPath,
            sha256: hash,
        });

        // Add to bundle with separator
        bundleParts.push(`<!-- SKILL: ${folder} -->\n${content}\n`);
    }

    // Concatenate all skills
    const bundleText = bundleParts.join('\n---\n\n');
    const bundleSha256 = sha256(bundleText);

    const bundle: SkillsBundle = {
        bundleText,
        skillCount: skills.length,
        skills,
        bundleSha256,
    };

    // Update cache (only for default directory)
    if (skillsDir === SKILLS_DIR) {
        cache = { bundle, mtimes };
        console.log(`[SkillsLoader] Cached ${bundle.skillCount} skills`);
    }

    return bundle;
}

/**
 * Clear the skills cache
 */
export function clearSkillsCache(): void {
    cache = null;
    console.log('[SkillsLoader] Cache cleared');
}

/**
 * Get skills metadata without full bundle text (for API responses)
 */
export function getSkillsMetadata(skillsDir?: string): {
    skillCount: number;
    skills: { name: string; sha256: string }[];
    bundleSha256: string;
} {
    const bundle = loadSkillsBundle(skillsDir);
    return {
        skillCount: bundle.skillCount,
        skills: bundle.skills.map(s => ({ name: s.name, sha256: s.sha256 })),
        bundleSha256: bundle.bundleSha256,
    };
}
