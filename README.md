# ai-web-eval

**An evaluator framework for AI web-browsing agents** — observe how AI models interact with real websites, detect recurring failure patterns across multiple runs, and automatically generate prompt improvements to boost performance.

## The Problem

When you use an AI model as a web-browsing agent (filling forms, searching for information, navigating multi-step flows), it makes mistakes. But not all mistakes are equal:

- Some are **recurring** — the model *always* clicks the wrong button on a certain page
- Some are **noise** — a slow network caused a one-time timeout
- Some are **strategic** — the model takes an inefficient path but still succeeds

Without systematic observation, you can't tell the difference. And without distinguishing signal from noise, your prompt improvements might fix one thing and break another.

## The Solution: Observe First, Then Improve

ai-web-eval separates **observation** from **improvement** into two distinct phases:

```
┌─────────────────────────────────┐
│      OBSERVATION PHASE          │
│                                 │
│  Run the same task N times      │
│  Record every action + result   │
│  Score each run independently   │
│            ↓                    │
│  Pattern Analyzer               │
│  - Cluster recurring failures   │
│  - Extract success patterns     │
│  - Identify critical steps      │
└──────────────┬──────────────────┘
               │ generalized patterns
               ↓
┌─────────────────────────────────┐
│      IMPROVEMENT PHASE          │
│                                 │
│  Synthesize patterns into       │
│  natural language prompt patch  │
│  Inject into system prompt      │
└──────────────┬──────────────────┘
               │ improved prompt
               ↓
          Re-observe
     (next observation cycle)
```

**Why?** A single bad run might be noise (model randomness, network timing). By observing N runs first, we distinguish **recurring patterns** (the model *always* clicks the wrong button) from **one-off flukes** (a slow page load caused a timeout). Only recurring patterns get turned into feedback — producing more stable, generalizable improvements.

## Features

- **Dual-mode agent communication**: Supports both OpenAI-style function calling and ReAct text parsing (`THOUGHT:` / `ACTION:` format), with auto-detection
- **Real website testing**: Evaluate agents on live, JS-heavy websites (Naver, Wikipedia, GitHub, etc.)
- **Statistical pattern analysis**: Cross-run failure clustering with frequency thresholds (>50% = signal, <30% = noise)
- **Automated feedback generation**: Patterns are synthesized into natural language prompt patches (AVOID / ALWAYS / AT STEP guidance)
- **Multi-cycle improvement loop**: Observe → analyze → improve → re-observe, with early stopping when pass rate converges
- **Comprehensive scoring**: Weighted metrics for completion (50%), efficiency (25%), and accuracy (25%)
- **Detailed reporting**: JSON data + Markdown summaries with score tables, pattern lists, and progression tracking

## Prerequisites

- **Node.js** >= 18
- **[agent-browser](https://github.com/anthropics/agent-browser)** CLI installed (Playwright-based browser automation)
- **[LM Studio](https://lmstudio.ai/)** or any OpenAI-compatible API server running locally

```bash
# Install agent-browser (macOS)
brew install agent-browser

# Or via npm
npm install -g agent-browser
```

## Installation

```bash
git clone https://github.com/half2one1/ai-web-eval.git
cd ai-web-eval
npm install
npm run build
```

## Quick Start

### 1. Start your model server

Make sure LM Studio (or another OpenAI-compatible API) is running at `http://localhost:1234/v1`.

### 2. Run a single observation

```bash
# Observe the Wikipedia lookup task (3 runs by default)
npx tsx src/index.ts observe tasks/info-lookup-wikipedia.yaml

# With more runs for better statistical significance
npx tsx src/index.ts observe tasks/info-lookup-wikipedia.yaml --runs 5

# With a specific model
npx tsx src/index.ts observe tasks/form-fill-naver.yaml --model "qwen2.5-coder-32b"
```

This will:
1. Run the task 3+ times with isolated browser sessions
2. Record every action the model takes
3. Verify the final browser state against expected outcomes
4. Analyze patterns across all runs
5. Print a summary and save detailed reports to `results/`

### 3. Run a full improvement cycle

```bash
# Observe → analyze → improve → re-observe (up to 3 cycles)
npx tsx src/index.ts cycle --task-dir tasks/ --max-cycles 3

# Stop early when 90% pass rate is reached
npx tsx src/index.ts cycle tasks/form-fill-naver.yaml --target-pass-rate 0.9

# With verbose logging to see every action
npx tsx src/index.ts cycle tasks/info-lookup-wikipedia.yaml --verbose
```

### 4. Review results

Reports are saved in `results/`:

```
results/
├── cycle-1/
│   ├── info-lookup-wikipedia.json     # Raw trace + analysis data
│   └── info-lookup-wikipedia.md       # Human-readable report
├── cycle-2/
│   ├── ...
├── summary.json                       # Cross-cycle progression data
└── summary.md                         # Overall evaluation summary
```

## CLI Reference

```
ai-web-eval observe <task-file>              # Single task observation
ai-web-eval observe --task-dir <dir>         # Observe all tasks in a directory
ai-web-eval cycle <task-file>                # Full observe → improve loop
ai-web-eval cycle --task-dir <dir>           # Full cycle for all tasks

Options:
  --model <name>            Model name for LM Studio (default: "default")
  --api-url <url>           API endpoint (default: http://localhost:1234/v1)
  --runs <n>                Observation runs per task (min 3)
  --max-cycles <n>          Maximum improvement cycles (default: 3)
  --target-pass-rate <f>    Early stop threshold (default: 0.9)
  --verbose                 Enable debug logging
  --output-dir <dir>        Results directory (default: ./results)
  --help                    Show help
```

## Writing Task Definitions

Tasks are defined in YAML files. Here's a complete example:

```yaml
id: info-lookup-wikipedia
name: Wikipedia Fact Lookup
category: info-lookup        # form-fill | info-lookup | navigation | interaction
url: "https://en.wikipedia.org"
goal: |
  Search Wikipedia for "Turing Award" and find who won the award in 2023.
  Report the winner's name.
maxSteps: 20                 # Maximum actions the agent can take
timeoutMs: 120000            # Hard timeout in milliseconds
observationRuns: 5           # How many times to run before analyzing (min 3)
mode: auto                   # function-calling | react | auto

expectedOutcome:
  expectedContent:           # Text that should appear on the final page
    - "Bob Metcalfe"
  expectedUrl: ".*wiki.*"    # Regex for the final URL
  assertions:                # DOM-level checks
    - selector: "#firstHeading"
      check: text            # exists | visible | value | text | checked
      contains: "Turing Award"
  optimalSteps: 6            # For efficiency scoring
```

### Task categories

| Category | Description | Example |
|----------|-------------|---------|
| `form-fill` | Fill and submit web forms | Search box, registration form, contact form |
| `info-lookup` | Find specific information on a website | Wikipedia fact, product price, news article |
| `navigation` | Navigate through multiple pages to a target | Multi-step checkout, deep-linked content |
| `interaction` | Complex interactions (dropdowns, tabs, modals) | Filtering, sorting, accordion menus |

### Expected outcome checks

| Check | Description |
|-------|-------------|
| `formValues` | Map of CSS selector → expected input value |
| `expectedContent` | List of strings that should appear in page text |
| `expectedUrl` | Regex the final URL should match |
| `assertions` | DOM assertions (exists, visible, value, text, checked) |
| `optimalSteps` | Ideal number of steps (for efficiency scoring) |

## Architecture

### Module Overview

```
src/
├── harness/                 # Agent communication layer
│   ├── agent-harness.ts     # Core agent loop (API calls + trace recording)
│   ├── adapter.ts           # Unified interface for both communication modes
│   ├── function-calling-adapter.ts  # OpenAI function calling mode
│   ├── react-adapter.ts     # ReAct text parsing mode (THOUGHT/ACTION)
│   ├── browser-tools.ts     # Tool definitions (12 browser actions)
│   ├── tool-executor.ts     # Maps tool calls → agent-browser CLI commands
│   ├── prompt-builder.ts    # System prompt construction with feedback injection
│   └── session-manager.ts   # Isolated browser sessions per run
│
├── verifier/                # Post-run verification
│   ├── verifier.ts          # DOM assertions against live browser state
│   └── trace-annotator.ts   # Labels actions: mistake/redundant/recovery/optimal
│
├── scoring/                 # Performance metrics
│   └── scorer.ts            # Weighted scoring (completion/efficiency/accuracy)
│
├── analysis/                # Cross-run pattern detection
│   ├── pattern-analyzer.ts  # Orchestrates analysis pipeline
│   ├── failure-clusterer.ts # Groups recurring failures by type and position
│   └── success-extractor.ts # Extracts consistently successful strategies
│
├── feedback/                # Prompt improvement generation
│   ├── feedback-synthesizer.ts  # Patterns → natural language guidance
│   └── prompt-injector.ts   # Manages accumulated feedback across cycles
│
├── runner/                  # Orchestration
│   ├── observation-runner.ts    # Runs task N times, collects traces
│   ├── eval-cycle.ts        # Full observe → analyze → improve loop
│   └── reporter.ts          # JSON + Markdown report generation
│
├── types/                   # TypeScript type definitions
│   ├── task.ts              # TaskDefinition, ExpectedOutcome
│   ├── trace.ts             # ActionTrace, TracedAction, ActionAnnotation
│   ├── score.ts             # RunScore, ObservationReport
│   ├── pattern.ts           # FailurePattern, SuccessPattern, CriticalStep
│   └── feedback.ts          # PromptPatch, AccumulatedFeedback
│
├── utils/                   # Shared utilities
│   ├── exec.ts              # Shell exec wrapper for agent-browser
│   └── logger.ts            # Structured console logger
│
└── index.ts                 # CLI entry point
```

### How the Agent Harness Works

The harness wraps an AI model and gives it browser tools:

1. **System prompt** is built with base instructions + mode-specific format (function calling or ReAct) + any feedback from previous cycles
2. **Task prompt** gives the model its goal and starting URL
3. **Agent loop**: The model responds with actions → harness executes them via `agent-browser` CLI → results are fed back → model decides next action
4. **Auto-snapshot**: After significant actions (click, fill, navigate), the harness automatically takes an accessibility snapshot so the model can see the updated page state
5. **Trace recording**: Every action, thought, result, and timing is recorded for post-run analysis

### How Pattern Analysis Works

After N runs of the same task, the analyzer looks for:

**Failure clustering** — Groups failures by action type and position in the task flow:
- `>60%` frequency = **consistent failure** → strong signal, generates AVOID guidance
- `30-60%` = **frequent failure** → moderate signal
- `<30%` = **sporadic** → likely noise, ignored

**Success extraction** — Finds patterns present in all passing runs:
- Common opening sequences (e.g., "always snapshot first")
- Pre-action habits (e.g., "snapshot before every fill")
- Strategy patterns (average step count, dominant actions)

**Critical step detection** — Identifies steps where successful and failed runs diverge (e.g., "at step 3, successful runs click @e7 but failed runs click @e5")

### How Feedback Injection Works

Patterns are synthesized into three types of guidance:

```
AVOID (step 3): Model frequently fails at 'click' around step 3: element not found
  [occurred in 80% of runs]

ALWAYS: Successful runs take a snapshot before filling forms (90% of the time)

AT STEP 5: Successful runs use 'snapshot', failed runs use 'click'.
  Prefer 'snapshot' over 'click'.
```

This text is injected into the system prompt between base instructions and the task goal, bounded to 2000 characters to prevent prompt bloat. Newer feedback takes priority over older patches.

### Scoring System

Each run is scored on three dimensions:

| Metric | Weight | Calculation |
|--------|--------|-------------|
| **Completion** | 50% | Assertions passed / total + URL/content match bonuses |
| **Efficiency** | 25% | Optimal steps / actual steps (capped at 1.0) |
| **Accuracy** | 25% | (Total actions - mistakes) / total actions |

A run **passes** when all verification checks succeed AND the agent signals task completion.

### Trace Annotation

Every action in a trace is labeled:

| Label | Meaning | Example |
|-------|---------|---------|
| `optimal` | Directly progresses toward the goal | Filling a required form field |
| `mistake` | Action failed or produced an error | Clicking a non-existent element |
| `redundant` | Repeated action with no state change | Two consecutive snapshots |
| `recovery` | Corrective action after a mistake | Re-filling a field with the right value |
| `suboptimal` | Works but isn't efficient | Taking a screenshot when a snapshot would suffice |

## Example: What a Report Looks Like

After running `ai-web-eval observe tasks/info-lookup-wikipedia.yaml --runs 5`:

```markdown
# Cycle 0 — info-lookup-wikipedia

## Summary
- Total runs: 5
- Pass rate: 60%
- Failure patterns: 2
- Success patterns: 1

## Run Scores
| Run | Passed | Overall | Completion | Efficiency | Accuracy | Steps |
|-----|--------|---------|------------|------------|----------|-------|
| 1   | YES    | 0.85    | 1.00       | 0.75       | 0.90     | 8     |
| 2   | NO     | 0.42    | 0.50       | 0.40       | 0.33     | 15    |
| 3   | YES    | 0.90    | 1.00       | 0.86       | 0.86     | 7     |
| 4   | NO     | 0.38    | 0.00       | 0.30       | 0.85     | 20    |
| 5   | YES    | 0.88    | 1.00       | 0.75       | 0.88     | 8     |

## Failure Patterns
- **Model frequently fails at 'click' around step 5: element not found** (60%)
- **Model uses suboptimal 'screenshot' action around step 3** (40%)

## Success Patterns
- **Successful runs consistently start with: open → snapshot** (100%)

## Generated Feedback
AVOID (step 5): Model frequently fails at 'click' around step 5 [occurred in 60% of runs]
ALWAYS: Successful runs consistently start with: open → snapshot
```

## Configuration Tips

### Using different API providers

```bash
# LM Studio (default)
npx tsx src/index.ts observe tasks/example.yaml --api-url http://localhost:1234/v1

# Ollama
npx tsx src/index.ts observe tasks/example.yaml --api-url http://localhost:11434/v1

# Any OpenAI-compatible endpoint
npx tsx src/index.ts observe tasks/example.yaml --api-url https://your-api.example.com/v1
```

### Choosing the right number of runs

- **3 runs** (default): Quick evaluation, catches obvious recurring failures
- **5 runs**: Good balance of speed and statistical reliability
- **10+ runs**: For subtle patterns or high-variance models

### When to use which mode

- **`auto`** (default): Tries function calling first, falls back to ReAct if the model doesn't respond with tool calls
- **`function-calling`**: For models with reliable tool/function calling support (GPT-4, Qwen 2.5, etc.)
- **`react`**: For models that work better with text-based reasoning (smaller models, instruction-tuned models without tool training)

## License

MIT
