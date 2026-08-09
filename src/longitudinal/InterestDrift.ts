// InterestDriftDetector — bounded, evidence-gated salience drift (v3 §9).
// A proposed change must accumulate supporting evidence across multiple
// sessions before it is committed; the drift itself is small and anchored
// to the stored baseline, so it reverts by default (v2 §11 philosophy on a
// slower clock).

import type { Thought } from '@alterego/data';

export interface InterestBaseline {
  /** Interest keyword, e.g. 'fotografia'. */
  keyword: string;
  /** Current salience (0-1) as stored in the IdentityProfile. */
  salience: number;
}

export interface DriftProposal {
  keyword: string;
  oldSalience: number;
  newSalience: number;
  /** Distinct sessions (days) with evidence for this interest. */
  evidenceSessions: number;
  /** Total thought mentions across all evidence. */
  mentionCount: number;
  confidence: number;
}

export interface DriftInput {
  interests: InterestBaseline[];
  /** Recent thoughts window — the evidence source. */
  thoughts: Thought[];
  /** Minimum distinct sessions before any proposal is made. */
  minSessions?: number;
  /** Maximum absolute drift per pass. */
  maxDrift?: number;
  /** Sessions at/above which the drift is strong enough to auto-commit. */
  autoCommitSessions?: number;
}

const MAX_DRIFT = 0.2;
const MIN_SESSIONS = 3;
const AUTO_COMMIT_SESSIONS = 5;

/** Negative markers — thoughts that suggest waning interest. */
const DECAY_MARKERS = [
  'não gosto mais', 'nao gosto mais', 'cansei de', 'larguei', 'abandonei', 'desisti de',
  'perdi o interesse', 'não tenho mais', 'nao tenho mais', 'deixei de',
];

export class InterestDriftDetector {
  detect(input: DriftInput): DriftProposal[] {
    const minSessions = input.minSessions ?? MIN_SESSIONS;
    const maxDrift = input.maxDrift ?? MAX_DRIFT;
    const autoCommitSessions = input.autoCommitSessions ?? AUTO_COMMIT_SESSIONS;
    const proposals: DriftProposal[] = [];

    for (const interest of input.interests) {
      const keyword = interest.keyword.toLowerCase();
      const matching = input.thoughts.filter((t) => t.content.toLowerCase().includes(keyword));
      if (matching.length === 0) continue;

      const sessions = new Set(matching.map((t) => t.createdAt.slice(0, 10))).size;
      if (sessions < minSessions) continue;

      const decaying = matching.some((t) => DECAY_MARKERS.some((marker) => t.content.toLowerCase().includes(marker)));
      const direction = decaying ? -1 : 1;
      const strength = Math.min(1, matching.length / 10);
      const drift = Math.min(maxDrift, maxDrift * strength * direction);
      const newSalience = Math.max(0, Math.min(1, interest.salience + drift));
      const confidence = Math.min(0.95, 0.3 + sessions * 0.1);

      proposals.push({
        keyword: interest.keyword,
        oldSalience: interest.salience,
        newSalience: newSalience,
        evidenceSessions: sessions,
        mentionCount: matching.length,
        confidence,
      });
      void autoCommitSessions; // threshold applied by IdentityEvolutionService
    }
    return proposals;
  }
}
