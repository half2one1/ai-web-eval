# Cycle 2 — law-search-korea

Generated: 2026-03-26T22:40:54.639Z

## Summary
- **Total runs**: 3
- **Pass rate**: 100%
- **Failure patterns**: 6
- **Success patterns**: 3
- **Critical steps**: 0

## Run Scores
| Run | Passed | Overall | Completion | Efficiency | Accuracy | Steps |
|-----|--------|---------|------------|------------|----------|-------|
| 1 | YES | 0.89 | 1.00 | 0.86 | 0.71 | 7 |
| 2 | YES | 0.93 | 1.00 | 0.86 | 0.86 | 7 |
| 3 | YES | 0.84 | 1.00 | 0.75 | 0.63 | 8 |

## Failure Patterns
- **Model frequently fails at 'open' around step 0: ✗ page.title: Execution context was destroyed, most likely because of a navigation
** (frequency: 100%, steps: 0)
- **Model never signaled task completion (never called task_complete/done) — ran out of steps every time** (frequency: 100%, steps: )
- **Model redundantly repeats 'snapshot' around step 5 without state change** (frequency: 33%, steps: 5)
- **Model frequently fails at 'fill' around step 6: ✗ Element "@e1" not found or not visible. Run 'snapshot' to see current page elements.
** (frequency: 33%, steps: 6)
- **Model frequently fails at 'snapshot' around step 6** (frequency: 33%, steps: 5,6)
- **Model gets stuck in a loop repeating 'snapshot' without making progress toward the task goal** (frequency: 33%, steps: 5)

## Success Patterns
- **Successful runs consistently start with: open → snapshot → fill → click** (consistency: 100%)
- **Successful runs take a snapshot before filling forms (80% of the time)** (consistency: 80%)
- **Successful runs average 7.3 actions, primarily using: snapshot, fill, click** (consistency: 90%)

## Generalized Failure Reasons
- Model frequently fails at 'open' around step 0: ✗ page.title: Execution context was destroyed, most likely because of a navigation

- Model never signaled task completion (never called task_complete/done) — ran out of steps every time

## Generalized Success Reasons
- Successful runs consistently start with: open → snapshot → fill → click
- Successful runs take a snapshot before filling forms (80% of the time)
- Successful runs average 7.3 actions, primarily using: snapshot, fill, click