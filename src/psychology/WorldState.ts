// WorldStateService — continuously-ticking internal simulation (v2 §2).
// One state per agent; calendar entries (identity, v3 §5) take priority over
// probabilistic ticks. The LLM never sets or reads this directly.

import type { EventBus } from '@alterego/events';
import type { WorldState } from '@alterego/data';
import { CalendarBridge, CalendarOverride, clamp01, WorldStateTickInput } from './Types.js';

interface WorldStateRepo {
  upsert(state: Omit<WorldState, 'id' | 'updatedAt'> & { id?: string }): Promise<WorldState>;
  findByAgent(agentId: string): Promise<WorldState | undefined>;
}

interface SchedulerLike {
  register(type: string, handler: (payload: Record<string, unknown>) => Promise<void> | void): void;
  scheduleRecurring(type: string, intervalMs: number, payload?: Record<string, unknown>): void;
}

const DEFAULT_STATE = {
  activity: 'idle',
  locationContext: 'home',
  availability: 0.7,
  energyLevel: 0.7,
  stressLevel: 0.3,
  focusLevel: 0.6,
  deviceBattery: 80,
  sleepState: 'awake',
  currentActivityDetail: 'passeando pelo celular',
};

export const WORLD_STATE_TICK_JOB = 'world-state.tick';

const ACTIVITIES: Array<{ activity: string; locationContext: string; availability: number; detail: string }> = [
  { activity: 'idle', locationContext: 'home', availability: 0.7, detail: 'passeando pelo celular' },
  { activity: 'working', locationContext: 'home', availability: 0.3, detail: 'no trabalho' },
  { activity: 'commuting', locationContext: 'travelling', availability: 0.2, detail: 'no transporte' },
  { activity: 'eating', locationContext: 'home', availability: 0.5, detail: 'comendo alguma coisa' },
  { activity: 'socializing', locationContext: 'out', availability: 0.4, detail: 'com amigos' },
  { activity: 'gaming', locationContext: 'home', availability: 0.1, detail: 'jogando um jogo' },
];

function hourOf(at: string): number {
  return new Date(at).getUTCHours();
}

function sleepStateForHour(hour: number): 'awake' | 'drowsy' | 'asleep' {
  if (hour >= 1 && hour < 7) return 'asleep';
  if (hour >= 7 && hour < 8) return 'drowsy';
  return 'awake';
}

export class WorldStateService {
  private readonly rng: () => number;

  constructor(
    private readonly bus: EventBus,
    private readonly repo: WorldStateRepo,
    private readonly calendar: CalendarBridge,
    rng: () => number = Math.random,
  ) {
    this.rng = rng;
  }

  /** Register the recurring tick job on the scheduler (wired in agent-runtime). */
  start(scheduler: SchedulerLike): void {
    scheduler.register(WORLD_STATE_TICK_JOB, async (payload) => {
      const agentId = String(payload.agentId ?? '');
      if (agentId) await this.tick({ agentId });
    });
    scheduler.scheduleRecurring(WORLD_STATE_TICK_JOB, 5 * 60 * 1000, { agentId: '' });
  }

  async tick(input: WorldStateTickInput): Promise<WorldState> {
    const at = input.at ?? new Date().toISOString();
    const existing = await this.repo.findByAgent(input.agentId);
    const current: WorldState = existing ?? {
      id: '',
      agentId: input.agentId,
      ...DEFAULT_STATE,
      updatedAt: at,
    };

    const activeEntries = await this.calendar.calendarActiveAt(at, input.agentId);
    const override = activeEntries[0]?.worldStateOverride;

    const next = this.advance(current, at, override);
    const saved = await this.repo.upsert(next);

    this.bus.publish('WorldStateUpdated', {
      activity: saved.activity,
      availability: saved.availability,
      energyLevel: saved.energyLevel,
      stressLevel: saved.stressLevel,
      focusLevel: saved.focusLevel,
      updatedAt: saved.updatedAt,
    });
    return saved;
  }

  private advance(
    current: WorldState,
    at: string,
    override: CalendarOverride | undefined,
  ): Omit<WorldState, 'id' | 'updatedAt'> & { id?: string } {
    const hour = hourOf(at);
    const sleepState = sleepStateForHour(hour);

    // Calendar takes priority over probabilistic ticks (v3 §5).
    if (override) {
      return {
        id: current.id,
        agentId: current.agentId,
        activity: override.activity ?? current.activity,
        locationContext: override.locationContext ?? current.locationContext,
        availability: clamp01(current.availability + (override.availabilityDelta ?? 0)),
        energyLevel: current.energyLevel,
        stressLevel: current.stressLevel,
        focusLevel: current.focusLevel,
        deviceBattery: this.decayBattery(current.deviceBattery),
        sleepState: sleepState === 'asleep' ? 'asleep' : 'awake',
        currentActivityDetail: override.activity ?? current.currentActivityDetail,
      };
    }

    // Sleep cycle: asleep/drowsy at night — deterministic, not random.
    if (sleepState === 'asleep') {
      return {
        id: current.id,
        agentId: current.agentId,
        activity: 'sleeping',
        locationContext: 'home',
        availability: 0,
        energyLevel: clamp01(current.energyLevel + 0.06),
        stressLevel: clamp01(current.stressLevel - 0.02),
        focusLevel: 0,
        deviceBattery: this.chargeBattery(current.deviceBattery),
        sleepState: 'asleep',
        currentActivityDetail: 'dormindo',
      };
    }

    // Probabilistic transition between bounded activity states.
    const roll = this.rng();
    let nextActivity = current.activity;
    let nextLocation = current.locationContext;
    let nextAvailability = current.availability;
    let nextDetail = current.currentActivityDetail;
    let transitioned = false;
    if (roll < 0.02) {
      const candidate = ACTIVITIES[Math.floor(this.rng() * ACTIVITIES.length)];
      nextActivity = candidate.activity;
      nextLocation = candidate.locationContext;
      nextAvailability = candidate.availability;
      nextDetail = candidate.detail;
      transitioned = true;
    }

    // Energy: recovers toward daytime baseline, drains with activity.
    const daytime = hour >= 8 && hour < 23;
    const energyTarget = daytime ? 0.65 : 0.8;
    const drain = current.energyLevel > energyTarget ? -0.01 : 0;
    const energyLevel = clamp01(current.energyLevel + (transitioned ? -0.03 : drain) + (daytime ? 0.005 : 0.01));

    // Stress decays toward baseline; focus re-centers; availability drifts.
    const stressLevel = clamp01(current.stressLevel + (0.3 - current.stressLevel) * 0.05);
    const focusLevel = clamp01(current.focusLevel + (0.6 - current.focusLevel) * 0.05 + (transitioned ? -0.1 : 0));

    return {
      id: current.id,
      agentId: current.agentId,
      activity: nextActivity,
      locationContext: nextLocation,
      availability: clamp01(nextAvailability + (nextAvailability - current.availability) * 0.1),
      energyLevel,
      stressLevel,
      focusLevel,
      deviceBattery: this.decayBattery(current.deviceBattery),
      sleepState: sleepState === 'drowsy' ? 'drowsy' : 'awake',
      currentActivityDetail: nextDetail,
    };
  }

  private decayBattery(battery: number): number {
    return Math.max(0, Math.round(battery - (Math.random() < 0.4 ? 1 : 0)));
  }

  private chargeBattery(battery: number): number {
    return Math.min(100, battery + 4);
  }
}

