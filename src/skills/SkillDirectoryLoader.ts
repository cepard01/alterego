import { Skill } from '@alterego/skills';
import { parseSkill } from '@alterego/skills';
import { readFile } from 'node:fs/promises';
import { join, isAbsolute } from 'node:path';

export async function loadSkillsFromDirectory(dir: string): Promise<Skill[]> {
  const { readdir } = await import('node:fs/promises');
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
  const { stat } = await import('node:fs/promises');
  const s = await stat(resolved).catch(() => null);
  if (!s) return [];
  if (s.isDirectory()) return loadSkillsFromDirectory(resolved);
  if (s.isFile()) {
    const source = await readFile(resolved, 'utf-8');
    return [parseSkill(source, resolved)];
  }
  return [];
}
