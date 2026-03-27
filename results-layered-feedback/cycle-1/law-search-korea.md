# Cycle 1 — law-search-korea

Generated: 2026-03-26T22:18:48.424Z

## Summary
- **Total runs**: 2
- **Pass rate**: 100%
- **Failure patterns**: 2
- **Success patterns**: 3
- **Critical steps**: 0

## Run Scores
| Run | Passed | Overall | Completion | Efficiency | Accuracy | Steps |
|-----|--------|---------|------------|------------|----------|-------|
| 1 | YES | 0.95 | 1.00 | 1.00 | 0.80 | 5 |
| 3 | YES | 0.96 | 1.00 | 1.00 | 0.83 | 6 |

## Failure Patterns
- **Model frequently fails at 'open' around step 0: ✗ page.title: Execution context was destroyed, most likely because of a navigation
** (frequency: 100%, steps: 0)
- **Model never signaled task completion (never called task_complete/done) — ran out of steps every time** (frequency: 100%, steps: )

## Success Patterns
- **Successful runs consistently start with: open → snapshot → fill → click → snapshot** (consistency: 100%)
- **Successful runs take a snapshot before filling forms (100% of the time)** (consistency: 100%)
- **Successful runs average 5.5 actions, primarily using: snapshot, click, open** (consistency: 90%)

## Generalized Failure Reasons
- Model frequently fails at 'open' around step 0: ✗ page.title: Execution context was destroyed, most likely because of a navigation

- Model never signaled task completion (never called task_complete/done) — ran out of steps every time

## Generalized Success Reasons
- Successful runs consistently start with: open → snapshot → fill → click → snapshot
- Successful runs take a snapshot before filling forms (100% of the time)
- Successful runs average 5.5 actions, primarily using: snapshot, click, open