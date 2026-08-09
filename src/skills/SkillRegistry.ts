import { Skill, SkillRegistry, SkillResult } from './SkillTypes.js';

export class InMemorySkillRegistry implements SkillRegistry {
  private skills = new Map<string, Skill>();

  register(skill: Skill): void {
    this.skills.set(skill.name, skill);
  }

  unregister(name: string): boolean {
    return this.skills.delete(name);
  }

  get(name: string): Skill | undefined {
    return this.skills.get(name);
  }

  list(): Skill[] {
    return Array.from(this.skills.values());
  }

  match(description: string, limit = 5): Skill[] {
    const query = description.toLowerCase();
    const scored = this.list()
      .map((skill) => ({
        skill,
        score: this.score(skill, query),
      }))
      .filter((entry) => entry.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, limit);

    return scored.map((entry) => entry.skill);
  }

  private score(skill: Skill, query: string): number {
    const name = skill.name.toLowerCase();
    const desc = skill.description.toLowerCase();
    let score = 0;
    if (name === query) score += 10;
    if (desc.includes(query)) score += 5;
    for (const word of query.split(/\s+/)) {
      if (word.length < 3) continue;
      if (name.includes(word)) score += 2;
      if (desc.includes(word)) score += 1;
    }
    return score;
  }
}

export async function executeSkill(
  registry: SkillRegistry,
  name: string,
  ctx: { agentId: string; sessionId?: string; input: unknown; metadata?: Record<string, unknown> },
): Promise<SkillResult> {
  const start = Date.now();
  const skill = registry.get(name);
  if (!skill) {
    return { skill: name, success: false, error: `Skill not found: ${name}`, durationMs: Date.now() - start };
  }

  try {
    const output = {
      skill: skill.name,
      description: skill.description,
      triggers: skill.triggers,
      input: ctx.input,
      instructions: skill.body,
      executedBy: ctx.agentId,
      sessionId: ctx.sessionId,
    };

    return {
      skill: skill.name,
      success: true,
      output,
      durationMs: Date.now() - start,
    };
  } catch (error) {
    return {
      skill: skill.name,
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
      durationMs: Date.now() - start,
    };
  }
}
