# Cycle 2 — law-search-korea

Generated: 2026-03-27T14:47:34.205Z

## Summary
- **Total runs**: 3
- **Pass rate**: 100%
- **Failure patterns**: 4
- **Success patterns**: 3
- **Critical steps**: 0

## Run Scores
| Run | Passed | Overall | Completion | Efficiency | Accuracy | Steps |
|-----|--------|---------|------------|------------|----------|-------|
| 1 | YES | 0.85 | 1.00 | 0.46 | 0.92 | 13 |
| 2 | YES | 0.84 | 1.00 | 0.55 | 0.82 | 11 |
| 3 | YES | 0.84 | 1.00 | 0.55 | 0.82 | 11 |

## Failure Patterns
- **Model frequently fails at 'open' (at the start, when opening the page): ✗ page.title: Execution context was destroyed, most likely because of a navigation
** (frequency: 100%, steps: 0)
- **Model never signaled task completion (never called task_complete/done) — ran out of steps every time** (frequency: 100%, steps: )
- **Model frequently fails at 'click' on the "10 형법 STAY 0" link (after observing the page, when clicking the "10 형법 STAY 0" link): ✗ Element "@e59" is blocked by another element (likely a modal or overlay). Try dismissing any modals/cookie banners first.
** (frequency: 33%, steps: 9)
- **Model frequently fails at 'click' on the "본문 바로가기" link (after observing the page, when clicking the "본문 바로가기" link): ✗ Action on "@e1" timed out. The element may be blocked, still loading, or not interactable. Run 'snapshot' to check the current page state.
** (frequency: 33%, steps: 10)

## Success Patterns
- **Successful runs consistently start with: open → snapshot → fill → click** (consistency: 100%)
- **Successful runs take a snapshot before filling forms (75% of the time)** (consistency: 75%)
- **Successful runs average 11.7 actions, primarily using: snapshot, click, fill** (consistency: 90%)

## Generalized Failure Reasons
- Model frequently fails at 'open' (at the start, when opening the page): ✗ page.title: Execution context was destroyed, most likely because of a navigation

- Model never signaled task completion (never called task_complete/done) — ran out of steps every time

## Generalized Success Reasons
- Successful runs consistently start with: open → snapshot → fill → click
- Successful runs average 11.7 actions, primarily using: snapshot, click, fill