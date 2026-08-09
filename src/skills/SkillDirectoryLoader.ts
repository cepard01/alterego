import { Skill } from '@alterego/skills';
import { parseSkill } from '@alterego/skills';
import { readFile, readdir, stat } from 'node:fs/promises';
import { join, isAbsolute, dirname, basename } from 'node:path';

export async function loadSkillsFromDirectory(dir: string): Promise<Skill[]> {
  const entries = await readdir(dir, { withFileTypes: true, recursive: false });
  const skills: Skill[] = [];

  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const skillPath = join(dir, entry.name, 'SKILL.md');
    try {
      const source = await readFile(skillPath, 'utf-8');
      skills.push(parseSkill(source, skillPath));
    } catch {
      // skip directories without SKILL.md
    }
  }

  return skills;
}

export async function loadSkillsFromPath(path: string): Promise<Skill[]> {
  const resolved = isAbsolute(path) ? path : join(process.cwd(), path);
  const s = await stat(resolved).catch(() => null);
  if (!s) return [];
  if (s.isDirectory()) return loadSkillsFromDirectory(resolved);
  if (s.isFile()) {
    const source = await readFile(resolved, 'utf-8');
    return [parseSkill(source, resolved)];
  }
  return [];
}

export async function loadModuleLocalSkills(root = process.cwd()): Promise<Skill[]> {
  const src = join(root, 'src');
  const entries = await readdir(src, { withFileTypes: true, recursive: false });
  const skills: Skill[] = [];

  const reads = entries.map(async (entry) => {
    if (!entry.isDirectory()) return null;
    const skillFile = join(src, entry.name, 'skills', 'SKILL.md');
    try {
      const source = await readFile(skillFile, 'utf-8');
      return parseSkill(source, skillFile);
    } catch {
      return null;
    }
  });

  const results = await Promise.all(reads);
  for (const skill of results) {
    if (skill) skills.push(skill);
  }

  return skills;
}

export async function loadCrossCuttingRules(root = process.cwd()): Promise<Skill[]> {
  const rulesDir = join(root, 'src', 'skills', 'rules');
  let entries: import('node:fs').Dirent[];
  try {
    entries = await readdir(rulesDir, { withFileTypes: true, recursive: false });
  } catch {
    return [];
  }
  const skills: Skill[] = [];

  for (const entry of entries) {
    if (entry.isDirectory()) continue;
    const path = join(rulesDir, entry.name);
    if (!path.endsWith('.md')) continue;
    try {
      const source = await readFile(path, 'utf-8');
      skills.push(parseSkill(source, path));
    } catch {
      // skip unreadable rule
    }
  }

  return skills;
}
