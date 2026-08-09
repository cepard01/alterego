// ThoughtVerifier — self-reflection on past predictions (v2 §3) plus
// certainty decay over time (v3 §7). Human memory is not a reliable database.

import type { EventBus } from '@alterego/events';
import type { Thought } from '@alterego/data';

interface ThoughtRepo {
  listByUser(userId: string, limit?: number): Promise<Thought[]>;
  setVerification(id: string, result: 'confirmed' | 'contradicted' | 'expired'): Promise<void>;
  updateConfidence(id: string, confidence: number): Promise<void>;
}

/** Words that indicate a statement contradicts an earlier prediction. */
const CONTRADICTION_MARKERS = ['não', 'nao', 'nunca', 'deixei', 'desisti', 'cancel', 'mudei de ideia', 'nem pensar'];

export class ThoughtVerifier {
  constructor(
    private readonly bus: EventBus,
    private readonly repo: ThoughtRepo,
  ) {}

  /**
   * Verify open predictions against an observed outcome (v2 §3 self-reflection).
   * Predictions whose text overlaps with the outcome are confirmed;
   * predictions about the same topic that the outcome contradicts are flagged.
   */
  async verifyAgainstOutcome(userId: string, outcome: string): Promise<Thought[]> {
    const open = await this.repo.listByUser(userId, 100);
    const predictions = open.filter((t) => t.category === 'prediction' && t.verificationStatus === 'unverified');
    const result: Thought[] = [];

    for (const prediction of predictions) {
      if (this.topicOverlap(prediction.content, outcome)) {
        const status: 'confirmed' | 'contradicted' = this.containsContradiction(outcome) ? 'contradicted' : 'confirmed';
        await this.repo.setVerification(prediction.id, status);
        result.push({ ...prediction, verificationStatus: status });
        this.bus.publish('ThoughtVerified', { thoughtId: prediction.id, verificationResult: status });
      }
    }
    return result;
  }

  /**
   * Decay certainty of thoughts untouched since `before` (v3 §7): an old fact
   * isn't necessarily unimportant, but the agent is reasonably less sure of it.
   */
  async decayConfidence(userId: string, before: string): Promise<number> {
    const thoughts = await this.repo.listByUser(userId, 200);
    let decayed = 0;
    for (const thought of thoughts) {
      if (thought.verificationStatus !== 'unverified') continue;
      if (thought.lastConfidenceDecayAt >= before) continue;
      const decayedConfidence = thought.confidence * 0.9;
      if (decayedConfidence < 0.2) {
        await this.repo.setVerification(thought.id, 'expired');
        this.bus.publish('ThoughtVerified', { thoughtId: thought.id, verificationResult: 'expired' });
      } else {
        await this.repo.updateConfidence(thought.id, decayedConfidence);
      }
      decayed += 1;
    }
    return decayed;
  }

  private topicOverlap(prediction: string, outcome: string): boolean {
    const predictionStems = this.words(prediction);
    const outcomeStems = this.words(outcome);
    const shared = predictionStems.filter((stem) => outcomeStems.some((candidate) => candidate === stem || candidate.includes(stem) || stem.includes(candidate)));
    return shared.length >= 1;
  }

  private containsContradiction(outcome: string): boolean {
    const normalized = outcome.toLowerCase();
    return CONTRADICTION_MARKERS.some((marker) => normalized.includes(marker));
  }

  /** Stem-ish normalization for PT: strips common inflectional suffixes. */
  private words(text: string): string[] {
    const raw = text
      .toLowerCase()
      .replace(/[^\p{L}\p{N}\s]/gu, ' ')
      .split(/\s+/)
      .filter((w) => w.length > 3);
    const suffixes = ['amos', 'emos', 'imos', 'aram', 'eram', 'ando', 'endo', 'ido', 'mos', 'am', 'em', 'ar', 'er', 'ir', 'os', 'as', 'es', 'a', 'o', 'e', 's'];
    return raw.map((word) => {
      let stem = word;
      for (let i = 0; i < 3; i += 1) {
        const suffix = suffixes.find((s) => stem.endsWith(s) && stem.length - s.length >= 4);
        if (!suffix) break;
        stem = stem.slice(0, stem.length - suffix.length);
      }
      return stem;
    });
  }
}
