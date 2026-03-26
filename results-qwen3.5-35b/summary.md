# Evaluation Summary

Generated: 2026-03-26T12:12:19.902Z

Total cycles: 2

## Cycle Progress
| Cycle | Tasks | Avg Pass Rate | Avg Score |
|-------|-------|---------------|-----------|
| 1 | 3 | 22% | 0.69 |
| 2 | 3 | 33% | 0.87 |

## Task Progression

### form-fill-naver-search
- Cycle 1: pass rate 0%
  Feedback: CRITICAL: All 3 runs failed to complete the task. The model may not be capable enough for this task type.
PROCEDURE: After opening a URL, you MUST take a snapshot to see interactive elements, then use...
- Cycle 2: pass rate 0%
  Feedback: CRITICAL: All 3 runs failed to complete the task. The model may not be capable enough for this task type.
PROCEDURE: After opening a URL, you MUST take a snapshot to see interactive elements, then use...

### info-lookup-wikipedia
- Cycle 1: pass rate 0%
  Feedback: AVOID: Model never signaled task completion (never called task_complete/done) — ran out of steps every time [100% of runs]
AVOID (around step 5): Model frequently fails at 'scroll' around step 6 [33% ...
- Cycle 2: pass rate 0%
  Feedback: AVOID: Model never signaled task completion (never called task_complete/done) — ran out of steps every time [100% of runs]
AVOID (around step 5): Model frequently fails at 'scroll' around step 6 [33% ...

### navigation-github-repo
- Cycle 1: pass rate 67%
  Feedback: AVOID: Model never signaled task completion (never called task_complete/done) — ran out of steps every time [100% of runs]
ALWAYS: Successful runs consistently start with: open → click → fill → click ...
- Cycle 2: pass rate 100%
  Feedback: AVOID: Model never signaled task completion (never called task_complete/done) — ran out of steps every time [100% of runs]
ALWAYS: Successful runs consistently start with: open → click → fill → click ...