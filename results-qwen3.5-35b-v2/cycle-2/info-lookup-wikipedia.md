# Cycle 2 — info-lookup-wikipedia

Generated: 2026-03-26T13:09:25.296Z

## Summary
- **Total runs**: 3
- **Pass rate**: 67%
- **Failure patterns**: 1
- **Success patterns**: 2
- **Critical steps**: 6

## Run Scores
| Run | Passed | Overall | Completion | Efficiency | Accuracy | Steps |
|-----|--------|---------|------------|------------|----------|-------|
| 1 | YES | 0.92 | 1.00 | 0.67 | 1.00 | 9 |
| 2 | YES | 0.89 | 1.00 | 0.86 | 0.71 | 7 |
| 3 | NO | 0.87 | 1.00 | 0.46 | 1.00 | 13 |

## Failure Patterns
- **Model never signaled task completion (never called task_complete/done) — ran out of steps every time** (frequency: 100%, steps: )

## Success Patterns
- **Successful runs consistently start with: open → fill → click → scroll** (consistency: 100%)
- **Successful runs average 8.0 actions, primarily using: scroll, click, snapshot** (consistency: 90%)

## Critical Steps
- Step 3: At step 3: successful runs use 'scroll', failed runs use 'click'
- Step 4: At step 4: successful runs use 'snapshot', failed runs use 'scroll'
- Step 5: At step 5: successful runs use 'click', failed runs use 'snapshot'
- Step 6: At step 6: successful runs use 'scroll', failed runs use 'click'
- Step 7: At step 7: successful runs use 'snapshot', failed runs use 'scroll'
- Step 8: At step 8: successful runs use 'click', failed runs use 'snapshot'

## Generalized Failure Reasons
- Model never signaled task completion (never called task_complete/done) — ran out of steps every time

## Generalized Success Reasons
- Successful runs consistently start with: open → fill → click → scroll
- Successful runs average 8.0 actions, primarily using: scroll, click, snapshot