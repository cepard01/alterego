import { Skill, SkillFrontmatter, SkillTrigger } from './SkillTypes.js';

const TRIGGER_ALIASES: Record<string, SkillTrigger> = {
  manual: 'manual',
  auto: 'contextual',
  contextual: 'contextual',
  context: 'contextual',
  scheduled: 'scheduled',
  schedule: 'scheduled',
  event: 'contextual',
  startup: 'contextual',
  shutdown: 'contextual',
};

function parseFrontmatter(raw: string): { frontmatter: SkillFrontmatter; body: string } {
  const match = raw.match(/^---\s*\n([\s\S]*?)\n---\s*\n?([\s\S]*)$/);
  if (!match) {
    return { frontmatter: { name: 'unknown', description: '' }, body: raw };
  }

  const fm: Record<string, string> = {};
  for (const line of match[1].split('\n')) {
    const m = line.match(/^([a-zA-Z0-9_-]+)\s*:\s*(.+)$/);
    if (m) fm[m[1].trim()] = m[2].trim().replace(/^["']|["']$/g, '');
  }

  const triggersRaw = (fm.triggers as string | undefined) || 'manual';
  const triggers = triggersRaw
    .split(',')
    .map((t) => t.trim().toLowerCase())
    .map((t) => TRIGGER_ALIASES[t] || 'manual');

  const frontmatter: SkillFrontmatter = {
    name: (fm.name as string) || 'unknown',
    description: (fm.description as string) || '',
    triggers: Array.from(new Set(triggers)),
    version: (fm.version as string) || '1.0.0',
  };

  return { frontmatter, body: match[2].trim() };
}

export function parseSkill(source: string, path: string): Skill {
  const { frontmatter, body } = parseFrontmatter(source);
  return {
    name: frontmatter.name,
    description: frontmatter.description,
    triggers: frontmatter.triggers ?? ['manual'],
    version: frontmatter.version ?? '1.0.0',
    body,
  };
}
