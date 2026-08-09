// Human Timing Model — replaces v1's randomized jitter with a full
// probabilistic model (v2 §7). Read/typing/send delays derived from
// activity, relationship, importance, time of day and attention span.

import { TimingInput, TimingPlan } from './Types.js';

/** Gaussian-ish sample centered on `mean` with `std` as fraction of mean. */
function jitter(mean: number, stdFraction = 0.15): number {
  const u = Math.random() + Math.random() + Math.random() + Math.random() + Math.random() + Math.random() - 3;
  return Math.max(50, Math.round(mean * (1 + u * 0.5 * stdFraction)));
}

function activityCurveMultiplier(activityCurve: Record<string, unknown> | undefined, timeOfDay: number | undefined): number {
  if (!activityCurve || timeOfDay === undefined) return 1;
  const entry = activityCurve[String(timeOfDay)];
  if (typeof entry === 'number' && entry > 0) return entry;
  return 1;
}

export class TimingModel {
  /** Full probabilistic delay computation (v2 §7). */
  computeDelay(input: TimingInput): TimingPlan {
    const availability = Math.max(0.01, Math.min(1, input.availability));
    const attention = Math.max(0.01, Math.min(1, input.focusLevel));
    const importance = Math.max(0, Math.min(1, input.messageImportance + input.relationshipImportance));
    const curve = activityCurveMultiplier(input.activityCurve, input.timeOfDay);

    // Read delay: fast for high availability, slow when busy; day/time curve.
    const readDelayMs = jitter((1200 + 9000 * (1 - availability)) * curve);

    // Attention span / interruptions (v2 §7): "saw it, got distracted,
    // came back" — a secondary gap before typing starts when focus is low
    // or the agent is mid-task.
    const midTask = /working|commuting|gaming|sleeping|eating/.test(input.activity);
    const distractionChance = midTask || attention < 0.4 ? 0.45 : 0.08;
    let typingStartDelayMs = jitter(800 + 2500 * (1 - availability), 0.2);
    if (Math.random() < distractionChance) {
      typingStartDelayMs += jitter(8000 + (1 - attention) * 25000, 0.3);
    }

    // Typing speed: wpm baseline with variance (v2 §7) — longer responses
    // visibly take longer to "type".
    const wpm = input.wordsPerMinute ?? 40;
    const chars = input.responseLengthChars ?? 120;
    const typingDurationMs = jitter((chars / (wpm * 5)) * 60_000, 0.2);

    // Send delay shrinks with importance (an urgent message is sent sooner).
    const sendDelayMs = jitter(600 + 1800 * (1 - importance), 0.2);

    return {
      readDelayMs,
      typingStartDelayMs,
      typingDurationMs,
      sendDelayMs,
      totalDelayMs: readDelayMs + typingStartDelayMs + typingDurationMs + sendDelayMs,
    };
  }
}

