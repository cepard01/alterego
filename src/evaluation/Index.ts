// Behavior Evaluation — post-session scoring of naturalness, consistency,
// and human-likeness (v2 §9).

export { EvaluatorService } from './evaluator.js';
export type { EvaluationDataPort, EvaluateInput, EvaluationResult, LlmJudge } from './evaluator.js';
export { HeuristicScorer, HUMAN_LIKENESS_WEIGHTS } from './heuristics.js';
export type { HeuristicInput, HeuristicResult, ReplyTimingExpectation } from './heuristics.js';
