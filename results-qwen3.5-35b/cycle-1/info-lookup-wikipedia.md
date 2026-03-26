# Cycle 1 — info-lookup-wikipedia

Generated: 2026-03-26T12:01:29.010Z

## Summary
- **Total runs**: 3
- **Pass rate**: 0%
- **Failure patterns**: 3
- **Success patterns**: 0
- **Critical steps**: 0

## Run Scores
| Run | Passed | Overall | Completion | Efficiency | Accuracy | Steps |
|-----|--------|---------|------------|------------|----------|-------|
| 1 | NO | 0.33 | 0.00 | 0.50 | 0.83 | 12 |
| 2 | NO | 0.90 | 1.00 | 0.60 | 1.00 | 10 |
| 3 | NO | 0.39 | 0.00 | 0.55 | 1.00 | 11 |

## Failure Patterns
- **Model never signaled task completion (never called task_complete/done) — ran out of steps every time** (frequency: 100%, steps: )
- **Model frequently fails at 'scroll' around step 6** (frequency: 33%, steps: 5,6)
- **Model gets stuck in a loop repeating 'scroll' without making progress toward the task goal** (frequency: 33%, steps: 5)

## Generalized Failure Reasons
- Model never signaled task completion (never called task_complete/done) — ran out of steps every time