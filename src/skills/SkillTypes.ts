export type SkillTrigger = 'manual' | 'contextual' | 'scheduled';

export interface SkillFrontmatter {
  name: string;
  description: string;
  triggers?: SkillTrigger[];
  version?: string;
}

export interface Skill {
  name: string;
  description: string;
  triggers: SkillTrigger[];
  version: string;
  body: string;
}

export interface SkillContext {
  agentId: string;
  sessionId?: string;
  input: unknown;
  metadata?: Record<string, unknown>;
}

export interface SkillResult {
  skill: string;
  success: boolean;
  output?: unknown;
  error?: string;
  durationMs: number;
}

export interface SkillRegistry {
  register(skill: Skill): void;
  unregister(name: string): boolean;
  get(name: string): Skill | undefined;
  list(): Skill[];
  match(description: string, limit?: number): Skill[];
}
