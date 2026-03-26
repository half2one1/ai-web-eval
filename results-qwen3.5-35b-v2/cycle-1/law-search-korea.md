# Cycle 1 — law-search-korea

Generated: 2026-03-26T12:59:25.316Z

## Summary
- **Total runs**: 3
- **Pass rate**: 67%
- **Failure patterns**: 2
- **Success patterns**: 2
- **Critical steps**: 0

## Run Scores
| Run | Passed | Overall | Completion | Efficiency | Accuracy | Steps |
|-----|--------|---------|------------|------------|----------|-------|
| 1 | NO | 0.75 | 1.00 | 1.00 | 0.00 | 1 |
| 2 | YES | 0.96 | 1.00 | 1.00 | 0.83 | 6 |
| 3 | YES | 0.84 | 1.00 | 0.55 | 0.82 | 11 |

## Failure Patterns
- **Model frequently fails at 'open' around step 0: ✗ page.title: Execution context was destroyed, most likely because of a navigation
** (frequency: 100%, steps: 0)
- **Model never signaled task completion (never called task_complete/done) — ran out of steps every time** (frequency: 100%, steps: )

## Success Patterns
- **Successful runs take a snapshot before filling forms (100% of the time)** (consistency: 100%)
- **Successful runs average 8.5 actions, primarily using: snapshot, click, open** (consistency: 90%)

## Generalized Failure Reasons
- Model frequently fails at 'open' around step 0: ✗ page.title: Execution context was destroyed, most likely because of a navigation

- Model never signaled task completion (never called task_complete/done) — ran out of steps every time

## Generalized Success Reasons
- Successful runs take a snapshot before filling forms (100% of the time)
- Successful runs average 8.5 actions, primarily using: snapshot, click, open