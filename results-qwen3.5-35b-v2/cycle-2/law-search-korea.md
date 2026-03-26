# Cycle 2 — law-search-korea

Generated: 2026-03-26T13:15:03.662Z

## Summary
- **Total runs**: 3
- **Pass rate**: 100%
- **Failure patterns**: 3
- **Success patterns**: 3
- **Critical steps**: 0

## Run Scores
| Run | Passed | Overall | Completion | Efficiency | Accuracy | Steps |
|-----|--------|---------|------------|------------|----------|-------|
| 1 | YES | 0.81 | 1.00 | 0.67 | 0.56 | 9 |
| 2 | YES | 0.96 | 1.00 | 1.00 | 0.83 | 6 |
| 3 | YES | 0.96 | 1.00 | 1.00 | 0.83 | 6 |

## Failure Patterns
- **Model frequently fails at 'open' around step 0: ✗ page.title: Execution context was destroyed, most likely because of a navigation
** (frequency: 100%, steps: 0)
- **Model frequently fails at 'snapshot' around step 6** (frequency: 33%, steps: 5,6,7)
- **Model gets stuck in a loop repeating 'snapshot' without making progress toward the task goal** (frequency: 33%, steps: 5)

## Success Patterns
- **Successful runs consistently start with: open → snapshot → fill → click** (consistency: 100%)
- **Successful runs take a snapshot before filling forms (75% of the time)** (consistency: 75%)
- **Successful runs average 7.0 actions, primarily using: snapshot, click, fill** (consistency: 90%)

## Generalized Failure Reasons
- Model frequently fails at 'open' around step 0: ✗ page.title: Execution context was destroyed, most likely because of a navigation


## Generalized Success Reasons
- Successful runs consistently start with: open → snapshot → fill → click
- Successful runs average 7.0 actions, primarily using: snapshot, click, fill