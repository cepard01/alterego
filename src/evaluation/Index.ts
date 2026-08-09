// Behavior Evaluation — post-session scoring of naturalness, consistency,
// and human-likeness (v2 §9).

export { EvaluatorService } from './Evaluator.js';
export type { EvaluationDataPort, EvaluateInput, EvaluationResult, LlmJudge } from './Evaluator.js';
export { HeuristicScorer, HUMAN_LIKENESS_WEIGHTS } from './Heuristics.js';
export type { HeuristicInput, HeuristicResult, ReplyTimingExpectation } from './Heuristics.js';

