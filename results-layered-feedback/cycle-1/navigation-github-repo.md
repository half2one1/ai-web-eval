# Cycle 1 — navigation-github-repo

Generated: 2026-03-26T22:23:57.654Z

## Summary
- **Total runs**: 3
- **Pass rate**: 67%
- **Failure patterns**: 3
- **Success patterns**: 2
- **Critical steps**: 6

## Run Scores
| Run | Passed | Overall | Completion | Efficiency | Accuracy | Steps |
|-----|--------|---------|------------|------------|----------|-------|
| 1 | YES | 0.81 | 1.00 | 0.38 | 0.88 | 16 |
| 2 | NO | 0.79 | 1.00 | 0.26 | 0.91 | 23 |
| 3 | YES | 0.89 | 1.00 | 0.55 | 1.00 | 11 |

## Failure Patterns
- **Model frequently fails at 'get' around step 5: Missing arguments for: get text
Usage: agent-browser get text <selector>
** (frequency: 100%, steps: 5)
- **Model frequently fails at 'get' around step 14: Missing arguments for: get html
Usage: agent-browser get html <selector>
** (frequency: 100%, steps: 14)
- **Model never signaled task completion (never called task_complete/done) — ran out of steps every time** (frequency: 100%, steps: )

## Success Patterns
- **Successful runs consistently start with: open → click → fill → click → click** (consistency: 100%)
- **Successful runs average 13.5 actions, primarily using: click, get, scroll** (consistency: 90%)

## Critical Steps
- Step 10: At step 10: successful runs use 'get', failed runs use 'scroll'
- Step 11: At step 11: successful runs use 'get', failed runs use 'snapshot'
- Step 12: At step 12: successful runs use 'scroll', failed runs use 'click'
- Step 13: At step 13: successful runs use 'snapshot', failed runs use 'get'
- Step 14: At step 14: successful runs use 'screenshot', failed runs use 'get'
- Step 15: At step 15: successful runs use 'get', failed runs use 'scroll'

## Generalized Failure Reasons
- Model frequently fails at 'get' around step 5: Missing arguments for: get text
Usage: agent-browser get text <selector>

- Model frequently fails at 'get' around step 14: Missing arguments for: get html
Usage: agent-browser get html <selector>

- Model never signaled task completion (never called task_complete/done) — ran out of steps every time

## Generalized Success Reasons
- Successful runs consistently start with: open → click → fill → click → click
- Successful runs average 13.5 actions, primarily using: click, get, scroll