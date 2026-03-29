# ai-web-eval

**An evaluator framework for AI web-browsing agents** — observe how AI models interact with real websites, detect recurring failure patterns across multiple runs, and automatically generate reusable prompt guidance to boost performance on current and future tasks.

## The Problem

When you use an AI model as a web-browsing agent (filling forms, searching for information, navigating multi-step flows), it makes mistakes. But not all mistakes are equal:

- Some are **recurring** — the model *always* clicks the wrong button on a certain page
- Some are **noise** — a slow network caused a one-time timeout
- Some are **strategic** — the model takes an inefficient path but still succeeds

Without systematic observation, you can't tell the difference. And without distinguishing signal from noise, your prompt improvements might fix one thing and break another.

## The Solution: Observe, Generalize, Reuse

ai-web-eval separates **observation** from **improvement**, and produces three layers of reusable knowledge:

```
┌─────────────────────────────────┐
│      OBSERVATION PHASE          │
│                                 │
│  Run the same task N times      │
│  Record every action + result   │
│  Score each run independently   │
│  Auto-snapshot after actions    │
│  Detect action loops at runtime │
│            ↓                    │
│  Pattern Analyzer               │
│  - Cluster recurring failures   │
│  - Extract success patterns     │
│  - Identify critical steps      │
└──────────────┬──────────────────┘
               │ generalized patterns
               ↓
┌─────────────────────────────────┐
│    THREE-LAYER SYNTHESIS        │
│                                 │
│  Model layer  — weaknesses &    │
│    strengths across all sites   │
│  Site layer   — domain-specific │
│    structure, pitfalls, tactics │
│  Task layer   — corrections     │
│    for this specific task       │
│            ↓                    │
│  Natural language feedback      │
│  injected into system prompt    │
└──────────────┬──────────────────┘
               │ improved prompt
               ↓
          Re-observe
     (next observation cycle)
               │
               ↓
┌─────────────────────────────────┐
│      REUSABLE OUTPUTS           │
│                                 │
│  Export feedback for use in     │
│  other agents: Claude Code,     │
│  ZeroClaw, custom agents, etc.  │
└─────────────────────────────────┘
```

**Why multiple runs?** A single bad run might be noise. By observing N runs first, we distinguish **recurring patterns** (the model *always* clicks the wrong button) from **one-off flukes** (a slow page load caused a timeout). Only recurring patterns get turned into feedback.

**Why three layers?** A model-level rule like "you forget to call task_complete" applies everywhere. A site-level insight like "Wikipedia uses dynamic loading after search" applies to all Wikipedia tasks. A task-level correction like "click the search button, not the settings icon" applies to one task. Separating these layers means knowledge transfers across tasks and sites.

## Features

- **Dual-mode agent communication**: OpenAI-style function calling and ReAct text parsing (`THOUGHT:` / `ACTION:` format), with auto-detection
- **Real website testing**: Evaluate agents on live, JS-heavy websites (Naver, Wikipedia, GitHub, etc.)
- **Statistical pattern analysis**: Cross-run failure clustering with frequency thresholds (>50% = signal, <30% = noise)
- **Three-layer feedback**: Model-level behavioral rules, site-level domain knowledge, task-level corrections
- **AI-powered synthesis**: Use a second LLM to generate nuanced, context-aware feedback (`--ai-synthesis`), with static fallback
- **Multi-cycle improvement loop**: Observe → analyze → improve → re-observe, with early stopping when pass rate converges
- **Auto-snapshot**: Automatically captures page state after significant actions (click, fill, select, navigate)
- **Loop detection**: Detects when the model repeats the same action and injects runtime correction
- **Trace annotation**: Labels every action as optimal, mistake, redundant, recovery, or suboptimal
- **Comprehensive scoring**: Weighted metrics for completion (50%), efficiency (25%), and accuracy (25%)
- **Reusable outputs**: Synthesis files can be directly injected into other AI agents as prompt guidance

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
git clone https://github.com/myhomemacminiagent/ai-web-eval.git
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
2. Record every action the model takes (with auto-snapshots after significant actions)
3. Verify the final browser state against expected outcomes
4. Analyze patterns across all runs
5. Print a summary and save detailed reports to `results/`

### 3. Run a full improvement cycle

```bash
# Observe → analyze → improve → re-observe (up to 3 cycles)
npx tsx src/index.ts cycle --task-dir tasks/ --max-cycles 3

# With AI-powered feedback synthesis
npx tsx src/index.ts cycle tasks/info-lookup-wikipedia.yaml --ai-synthesis

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
│   ├── info-lookup-wikipedia.json            # Raw trace + analysis data
│   ├── info-lookup-wikipedia.md              # Human-readable report
│   ├── info-lookup-wikipedia.synthesis.json   # Structured feedback (← reusable)
│   └── info-lookup-wikipedia.synthesis.md     # Synthesis audit log
├── cycle-2/
│   ├── ...
├── summary.json                              # Cross-cycle progression data
└── summary.md                                # Overall evaluation summary
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
  --ai-synthesis            Use AI model for feedback synthesis (richer output)
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
│   ├── agent-harness.ts     # Core agent loop + auto-snapshot + loop detection
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
├── feedback/                # Three-layer feedback system
│   ├── feedback-synthesizer.ts    # Template-based pattern → guidance rules
│   ├── ai-feedback-synthesizer.ts # LLM-powered synthesis (richer output)
│   ├── model-profile-extractor.ts # Cross-domain model behavior profiling
│   ├── site-profile-extractor.ts  # Domain-specific knowledge extraction
│   └── prompt-injector.ts         # Layered feedback assembly + injection
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
│   └── feedback.ts          # PromptPatch, LayeredFeedback, SiteProfile, ModelProfile
│
├── utils/                   # Shared utilities
│   ├── exec.ts              # Shell exec wrapper for agent-browser
│   ├── logger.ts            # Structured console logger
│   └── trace-context.ts     # Resolves element refs to readable descriptions
│
└── index.ts                 # CLI entry point
```

### How the Agent Harness Works

The harness wraps an AI model and gives it 12 browser tools (`open`, `snapshot`, `click`, `fill`, `select`, `hover`, `scroll`, `press_key`, `wait`, `go_back`, `screenshot`, `task_complete`):

1. **System prompt** is built with base browsing instructions + mode-specific format (function calling or ReAct) + any feedback from previous cycles
2. **Task prompt** gives the model its goal and starting URL
3. **Agent loop**: The model responds with actions → harness executes them via `agent-browser` CLI → results are fed back → model decides next action
4. **Auto-snapshot**: After significant actions (click, fill, select, navigate), the harness automatically takes an accessibility snapshot so the model sees the updated page state
5. **Loop detection**: If the model repeats the same action 3+ times, the harness injects a warning: *"You have repeated the same action N times. Try a different element or action."*
6. **Trace recording**: Every action, thought, result, timing, and annotation is recorded for post-run analysis

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

**Critical step detection** — Identifies steps where successful and failed runs diverge (e.g., "at step 3, successful runs click the search button but failed runs click the settings icon")

### Three-Layer Feedback System

When running multiple tasks (especially across the same site), feedback is organized into three layers that generalize differently:

```
┌─────────────────────────────────────────────────────────┐
│ MODEL LAYER — applies to ALL tasks on ALL sites         │
│                                                         │
│ Behavioral rules observed across 2+ domains:            │
│ • "You frequently fail to call task_complete"           │
│ • "You get stuck repeating the same action in loops"    │
└─────────────────────────────────────────────────────────┘
                          ↓
┌─────────────────────────────────────────────────────────┐
│ SITE LAYER — applies to all tasks on a specific domain  │
│                                                         │
│ Domain knowledge extracted from multiple tasks:         │
│ Structure:                                              │
│   • "Site uses iframes for content"                     │
│ Pitfalls:                                               │
│   ⚠ "Elements change after page updates"               │
│ Proven strategies:                                      │
│   → "Always snapshot before click/fill on this site"    │
│ Navigation patterns:                                    │
│   → "navigate → fill input → click search → read"      │
└─────────────────────────────────────────────────────────┘
                          ↓
┌─────────────────────────────────────────────────────────┐
│ TASK LAYER — applies to this specific task only         │
│                                                         │
│ Corrections from the previous cycle:                    │
│ STOP REPEATING: "You called snapshot 5 times in a row" │
│ MUST COMPLETE: "Call task_complete when done"           │
│ AVOID: "Don't click the settings icon at step 3"       │
└─────────────────────────────────────────────────────────┘
```

This layered approach means:
- After evaluating 2 Wikipedia tasks, the **site layer** knowledge (dynamic loading, search flow) automatically helps a 3rd Wikipedia task the model has never seen
- After evaluating tasks across Wikipedia and Naver, the **model layer** catches behavioral patterns (forgetting to signal completion, getting stuck in loops) that apply everywhere

### Feedback Synthesis Methods

**Static synthesis** (default): Template-based rules that transform patterns into guidance using predefined categories (STOP REPEATING, MUST INTERACT, AVOID REDUNDANCY, CRITICAL DECISION, KEEP DOING).

**AI synthesis** (`--ai-synthesis`): Sends the full analysis — performance summary, trace excerpts, existing feedback — to an LLM for nuanced, context-aware feedback. Includes validation to reject low-quality responses. Falls back to static if AI synthesis fails.

### Scoring System

Each run is scored on three dimensions:

| Metric | Weight | Calculation |
|--------|--------|-------------|
| **Completion** | 50% | Assertions passed / total + URL/content match bonuses |
| **Efficiency** | 25% | Optimal steps / actual steps (capped at 1.0) |
| **Accuracy** | 25% | (Total actions - mistakes) / total actions |

A run **passes** when any of these conditions are met:
- All verification checks pass AND the agent signals task completion
- Overall score >= 0.85 AND the agent signals task completion (high confidence without perfect verification)
- All verification checks pass AND overall score >= 0.75 (verified but model didn't explicitly signal completion)

### Trace Annotation

Every action in a trace is labeled:

| Label | Meaning | Example |
|-------|---------|---------|
| `optimal` | Directly progresses toward the goal | Filling a required form field |
| `mistake` | Action failed or produced an error | Clicking a non-existent element |
| `redundant` | Repeated action with no state change | Two consecutive snapshots |
| `recovery` | Corrective action after a mistake | Re-filling a field with the right value |
| `suboptimal` | Works but isn't efficient | Taking a screenshot when a snapshot would suffice |

## Output Artifacts

Every cycle run produces artifacts at different levels of detail. Here's what each file contains and when to use it:

### Per-cycle task files

| File | Content | Best for |
|------|---------|----------|
| `{taskId}.json` | Full traces with every action, snapshot, model message, score, and analysis | Building datasets, debugging agent behavior, programmatic analysis |
| `{taskId}.md` | Human-readable report with score tables, patterns, and run details | Quick review, sharing with teammates |
| `{taskId}.synthesis.json` | Structured feedback record with `generatedFeedback` field | **Reusing feedback in other agents** |
| `{taskId}.synthesis.md` | Audit log showing synthesis method, prompt (if AI), and output | Reviewing feedback quality, debugging synthesis |

### Top-level summary files

| File | Content | Best for |
|------|---------|----------|
| `summary.json` | Array of cycles with per-task pass rates, pattern counts | Dashboards, progress tracking |
| `summary.md` | Cycle progress table + per-task progression | Stakeholder reports |

### Key fields inside `{taskId}.json`

```
observation.runs[].trace.actions[]        — Every action with args, result, timing, annotation
observation.runs[].trace.actions[].snapshotAfter  — Page state (accessibility tree) after each action
observation.runs[].trace.completionSummary — What the agent reported it accomplished
observation.runs[].trace.modelMessages[]  — Full conversation (system + user + assistant messages)
observation.runs[].score                  — Detailed breakdown (completion, efficiency, accuracy)
analysis.failurePatterns[]                — Recurring failures with frequency and descriptions
analysis.successPatterns[]                — Consistent strategies from passing runs
analysis.generalizedReasons               — Human-readable pattern summaries
```

### Key field inside `{taskId}.synthesis.json`

```json
{
  "generatedFeedback": "STOP REPEATING: You called snapshot 5 times...\nMUST COMPLETE: Call task_complete when done...",
  "method": "static",
  "passRate": 0.33,
  "patternCount": 3
}
```

The `generatedFeedback` string is exactly what gets injected into the next cycle's system prompt. This is the primary artifact for reuse in other agents.

## Applying Results to Other AI Agents

The most valuable output of ai-web-eval is the **synthesized feedback** — natural language guidance distilled from observing a model's real behavior on real websites. This feedback is not tied to ai-web-eval's internal format. It's plain text designed to be injected into any AI agent's system prompt.

### What to export

After running a cycle, grab the feedback from:

```bash
# The generated feedback text (the reusable part)
cat results/cycle-2/info-lookup-wikipedia.synthesis.json | jq -r '.generatedFeedback'
```

For multi-task runs, the **layered feedback** (model + site + task) is assembled internally by `prompt-injector.ts`. The combined text appears in the system prompt of later cycles. You can extract it from the model messages in any cycle-2+ JSON report:

```bash
# Extract the full layered feedback from a cycle-2 run
cat results/cycle-2/info-lookup-wikipedia.json \
  | jq -r '.observation.runs[0].trace.modelMessages[0].content' \
  | sed -n '/GUIDANCE FROM PREVIOUS/,/END GUIDANCE/p'
```

### Applying feedback to Claude Code

Claude Code reads project-level instructions from `CLAUDE.md` at the repo root. To apply web-browsing lessons learned from ai-web-eval:

**1. Add a web browsing guidance section to your project's `CLAUDE.md`:**

```markdown
## Web Browsing Guidance

When using agent-browser or browsing the web, follow these rules
(learned from automated evaluation of web tasks):

### General behavioral rules
- After achieving the goal, immediately signal completion — do not continue browsing
- If an action fails, try a different element or approach instead of repeating the same action
- Always take a snapshot after click/fill/select to verify the page state changed

### Site-specific knowledge

#### wikipedia.org
- After submitting a search, wait for dynamic content to load before reading results
- The search results page uses dynamic rendering — snapshot after every navigation
- Interaction flow: open page → fill search box → click search → snapshot → read content

#### naver.com
- Site uses iframes — content may load inside frames
- After form fill, click the submit button (not press Enter) for reliable submission
```

**2. Or create a dedicated guidance file and reference it:**

```bash
# Export feedback to a file
cat results/cycle-2/info-lookup-wikipedia.synthesis.json \
  | jq -r '.generatedFeedback' > .claude/web-browsing-rules.md

# Reference in CLAUDE.md
echo "\nSee .claude/web-browsing-rules.md for web browsing guidance." >> CLAUDE.md
```

### Applying feedback to ZeroClaw

ZeroClaw is a Rust-based AI agent runtime that uses system prompts to configure agent behavior. To inject ai-web-eval's feedback into a ZeroClaw agent:

**1. Add feedback to the agent's system prompt configuration:**

ZeroClaw agents receive their instructions through system prompts configured in the runtime. Extract the feedback and include it in the agent's prompt template:

```rust
// In your ZeroClaw agent configuration
let web_guidance = include_str!("../prompts/web-browsing-rules.txt");
let system_prompt = format!(
    "{base_instructions}\n\n\
     --- WEB BROWSING GUIDANCE (from automated evaluation) ---\n\
     {web_guidance}\n\
     --- END GUIDANCE ---"
);
```

**2. Use the layered structure for multi-site agents:**

If your ZeroClaw agent handles multiple domains, split the feedback by layer:

```
prompts/
├── model-rules.txt       # General behavioral rules (apply always)
├── sites/
│   ├── wikipedia.txt     # Wikipedia-specific knowledge
│   ├── naver.txt         # Naver-specific knowledge
│   └── g2b.txt           # Korean procurement site knowledge
└── tasks/
    └── law-search.txt    # Task-specific corrections (optional)
```

Then in ZeroClaw, load the relevant site guidance based on the target URL:

```rust
let model_rules = include_str!("../prompts/model-rules.txt");
let site_rules = match target_domain {
    d if d.contains("wikipedia") => include_str!("../prompts/sites/wikipedia.txt"),
    d if d.contains("naver") => include_str!("../prompts/sites/naver.txt"),
    _ => "",
};
```

### Applying feedback to any OpenAI-compatible agent

For any agent that uses the OpenAI chat completions API, inject the feedback as part of the system message:

```python
import json

# Load feedback from ai-web-eval output
with open("results/cycle-2/task.synthesis.json") as f:
    feedback = json.load(f)["generatedFeedback"]

messages = [
    {
        "role": "system",
        "content": f"""{base_system_prompt}

--- WEB BROWSING GUIDANCE (from automated evaluation) ---
{feedback}
--- END GUIDANCE ---"""
    },
    {"role": "user", "content": "Search Wikipedia for the 2023 Turing Award winner"}
]

response = client.chat.completions.create(model="...", messages=messages)
```

### What makes this feedback transferable

The feedback ai-web-eval generates is **model-agnostic natural language**. It works across different agents because:

1. **It describes what to do, not how the framework works** — "always snapshot before clicking" is universal advice, not tied to any API
2. **Three layers map to any prompt architecture** — model rules go in the base prompt, site rules are loaded conditionally, task rules are appended per-task
3. **It's grounded in observed behavior** — not theoretical best practices, but corrections derived from watching a model actually fail on real websites
4. **It's bounded** — feedback is capped at 16KB to prevent prompt bloat, with newer feedback prioritized over older

### Iterative workflow across agents

A practical workflow for improving a web-browsing agent across different runtimes:

```
1. Define tasks in ai-web-eval          (tasks/*.yaml)
2. Run cycles against your model        (npx tsx src/index.ts cycle ...)
3. Export synthesized feedback           (results/cycle-N/*.synthesis.json)
4. Inject into your agent's prompts     (CLAUDE.md, ZeroClaw config, etc.)
5. Observe the agent in production
6. Define new tasks for failure cases   (back to step 1)
```

The framework doesn't need to be running in production. It's an **offline evaluation and feedback generation tool** — you run it to learn what guidance your model needs, then apply that guidance wherever your agent actually runs.

## Example: What a Report Looks Like

After running `ai-web-eval observe tasks/info-lookup-wikipedia.yaml --runs 5`:

```markdown
# Cycle 1 — info-lookup-wikipedia

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
AVOID: Model frequently fails at 'click' around step 5 [occurred in 60% of runs]
  FIX: Take a snapshot first to identify the correct element before clicking
ALWAYS: Successful runs consistently start with: open → snapshot
  Follow this sequence: open → snapshot before any other interaction
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

### Static vs AI synthesis

- **Static** (default): Fast, deterministic, template-based. Good for clear-cut patterns
- **AI** (`--ai-synthesis`): Richer, more nuanced feedback that understands context. Better for subtle issues but costs extra API calls and may occasionally produce lower-quality output (validated and falls back to static)

## License

MIT
