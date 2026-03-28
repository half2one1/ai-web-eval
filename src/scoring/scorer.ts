import type { ActionTrace, ActionAnnotation } from "../types/trace.js";
import type { RunScore } from "../types/score.js";
import type { VerificationResult } from "../verifier/verifier.js";

const WEIGHTS = {
  completion: 0.5,
  efficiency: 0.25,
  accuracy: 0.25,
};

export function computeScore(
  taskId: string,
  sessionId: string,
  runIndex: number,
  trace: ActionTrace,
  verification: VerificationResult,
  annotations: ActionAnnotation[],
  optimalSteps?: number,
): RunScore {
  // Completion score
  const assertionsPassed = verification.assertionResults.filter((r) => r.passed).length;
  const assertionsTotal = verification.assertionResults.length;

  let completionScore: number;
  if (assertionsTotal === 0) {
    // No assertions — rely on URL and content checks
    const checks: boolean[] = [];
    if (verification.urlMatch !== null) checks.push(verification.urlMatch);
    if (verification.contentMatch !== null) checks.push(verification.contentMatch);
    completionScore =
      checks.length > 0
        ? checks.filter(Boolean).length / checks.length
        : trace.completed
          ? 0.5
          : 0;
  } else {
    let score = assertionsPassed / assertionsTotal;
    // Adjust for URL and content checks: bonus if passed, penalty if explicitly failed
    if (verification.urlMatch === true) score = Math.min(1, score + 0.1);
    else if (verification.urlMatch === false) score = Math.max(0, score - 0.2);
    if (verification.contentMatch === true) score = Math.min(1, score + 0.1);
    else if (verification.contentMatch === false) score = Math.max(0, score - 0.2);
    completionScore = score;
  }

  // Efficiency score
  const actualSteps = trace.actions.length;
  const optimal = optimalSteps || actualSteps; // If no optimal defined, score is 1
  const redundantActions = annotations.filter((a) => a.type === "redundant").length;
  const recoveryActions = annotations.filter((a) => a.type === "recovery").length;
  const efficiencyScore = actualSteps > 0 ? Math.min(1, optimal / actualSteps) : 1;

  // Accuracy score
  const mistakes = annotations.filter((a) => a.type === "mistake");
  const totalActions = annotations.length;
  const correctActions = totalActions - mistakes.length;
  const accuracyScore = totalActions > 0 ? correctActions / totalActions : 1;

  // Overall weighted score
  const overall =
    completionScore * WEIGHTS.completion +
    efficiencyScore * WEIGHTS.efficiency +
    accuracyScore * WEIGHTS.accuracy;

  // Flexible pass criteria:
  // 1. Traditional: verification passed AND trace completed
  // 2. High score: overall >= 0.85 AND trace completed (verification may have inconclusive checks)
  // 3. Verification passed with high score: verification passed AND overall >= 0.75 (model may not have called task_complete)
  const traditionalPass = verification.passed && trace.completed;
  const highScorePass = overall >= 0.85 && trace.completed;
  const verifiedHighScore = verification.passed && overall >= 0.75;

  return {
    taskId,
    sessionId,
    runIndex,
    passed: traditionalPass || highScorePass || verifiedHighScore,
    overall,
    completion: {
      score: completionScore,
      assertionsPassed,
      assertionsTotal,
      details: verification.details,
    },
    efficiency: {
      score: efficiencyScore,
      actualSteps,
      optimalSteps: optimal,
      redundantActions,
      recoveryActions,
    },
    accuracy: {
      score: accuracyScore,
      correctActions,
      totalActions,
      mistakeCount: mistakes.length,
    },
    mistakes,
  };
}
