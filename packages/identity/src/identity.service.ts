// IdentityService — facade over the v3 identity cluster: profile, life
// timeline, inventory, goals, calendar (v3 §1-5). WHO the simulated person
// is, as opposed to how they behave or feel.

import { CalendarEntry, Goal, IdentityProfile, InventoryItem, TimelineEvent } from '@whatsapp-ai-agent/data';

export interface IdentitySnapshot {
  name: string;
  age: number;
  occupation: string;
  hometown: string;
  backgroundSummary: string;
  education: string[];
  interests: string[];
  values: string[];
  skills: string[];
  familySummary: string;
  version: number;
}

/** Structural subset of DataService's identity repositories. */
export interface IdentityData {
  identityProfiles: {
    upsert(profile: Omit<IdentityProfile, 'id' | 'createdAt' | 'lastEvolvedAt' | 'version'> & { id?: string; version?: number }): Promise<IdentityProfile>;
    findByAgent(agentId: string): Promise<IdentityProfile | undefined>;
  };
  timelineEvents: {
    create(event: Omit<TimelineEvent, 'id'> & { id?: string }): Promise<TimelineEvent>;
    listSince(agentId: string, since: string, limit?: number): Promise<TimelineEvent[]>;
  };
  inventoryItems: {
    create(item: Omit<InventoryItem, 'id'> & { id?: string }): Promise<InventoryItem>;
    listByAgent(agentId: string, onlyOwned?: boolean): Promise<InventoryItem[]>;
  };
  goals: {
    create(goal: Omit<Goal, 'id' | 'createdAt' | 'resolvedAt' | 'resolutionLink' | 'progress'> & { id?: string; progress?: number }): Promise<Goal>;
    listActive(agentId: string): Promise<Goal[]>;
    updateProgress(id: string, progress: number): Promise<void>;
    resolve(id: string, status: 'achieved' | 'abandoned', resolutionLink: Goal['resolutionLink']): Promise<void>;
  };
  calendarEntries: {
    create(entry: Omit<CalendarEntry, 'id'> & { id?: string }): Promise<CalendarEntry>;
    findActiveAt(instant: string, agentId: string): Promise<CalendarEntry[]>;
  };
}

export class IdentityService {
  constructor(private readonly data: IdentityData) {}

  async ensureProfile(agentId: string, profile: Omit<IdentityProfile, 'id' | 'createdAt' | 'lastEvolvedAt' | 'version' | 'agentId'>): Promise<IdentityProfile> {
    return this.data.identityProfiles.upsert({ agentId, ...profile });
  }

  async getProfile(agentId: string): Promise<IdentityProfile | undefined> {
    return this.data.identityProfiles.findByAgent(agentId);
  }

  async snapshot(agentId: string): Promise<IdentitySnapshot | undefined> {
    const profile = await this.getProfile(agentId);
    if (!profile) return undefined;
    return {
      name: profile.name,
      age: profile.age,
      occupation: profile.occupation,
      hometown: profile.hometown,
      backgroundSummary: profile.backgroundSummary,
      education: profile.education,
      interests: profile.interests,
      values: profile.values,
      skills: profile.skills,
      familySummary: profile.familySummary,
      version: profile.version,
    };
  }

  /** Record a life event; returns it for linking from goals/inventory. */
  async addTimelineEvent(event: Omit<TimelineEvent, 'id'>): Promise<TimelineEvent> {
    return this.data.timelineEvents.create(event);
  }

  timelineSince(agentId: string, since: string): Promise<TimelineEvent[]> {
    return this.data.timelineEvents.listSince(agentId, since);
  }

  addInventoryItem(item: Omit<InventoryItem, 'id'>): Promise<InventoryItem> {
    return this.data.inventoryItems.create(item);
  }

  inventory(agentId: string, onlyOwned = true): Promise<InventoryItem[]> {
    return this.data.inventoryItems.listByAgent(agentId, onlyOwned);
  }

  addGoal(goal: Omit<Goal, 'id' | 'createdAt' | 'resolvedAt' | 'resolutionLink' | 'progress'>): Promise<Goal> {
    return this.data.goals.create(goal);
  }

  activeGoals(agentId: string): Promise<Goal[]> {
    return this.data.goals.listActive(agentId);
  }

  updateGoalProgress(goalId: string, progress: number): Promise<void> {
    return this.data.goals.updateProgress(goalId, progress);
  }

  /**
   * Resolve a goal into a timeline event and/or inventory item (v3 §4) and
   * link them back.
   */
  async resolveGoal(
    goal: Goal,
    outcome: {
      status: 'achieved' | 'abandoned';
      timelineEvent?: Omit<TimelineEvent, 'id' | 'agentId' | 'relatedMemoryIds'>;
      inventoryItem?: Omit<InventoryItem, 'id' | 'agentId'>;
    },
  ): Promise<{ timelineEvent?: TimelineEvent; inventoryItem?: InventoryItem }> {
    const timelineEvent = outcome.timelineEvent
      ? await this.data.timelineEvents.create({
          agentId: goal.agentId,
          relatedMemoryIds: [],
          ...outcome.timelineEvent,
        })
      : undefined;
    const inventoryItem = outcome.inventoryItem
      ? await this.data.inventoryItems.create({
          agentId: goal.agentId,
          linkedGoalId: goal.id,
          ...outcome.inventoryItem,
        })
      : undefined;
    await this.data.goals.resolve(goal.id, outcome.status, {
      timelineEventId: timelineEvent?.id,
      inventoryItemId: inventoryItem?.id,
    });
    return { timelineEvent, inventoryItem };
  }

  addCalendarEntry(entry: Omit<CalendarEntry, 'id'>): Promise<CalendarEntry> {
    return this.data.calendarEntries.create(entry);
  }

  /** Active calendar entries at an instant — checked first by World State ticks (v3 §5). */
  calendarActiveAt(instant: string, agentId: string): Promise<CalendarEntry[]> {
    return this.data.calendarEntries.findActiveAt(instant, agentId);
  }
}
