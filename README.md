# Human Agent OS — Merged Codebase
### AABW 2026 · Founder Mode Track · Problem Statement 4

> **The only AI system that knows what it should NOT automate.**

A production-grade, multi-agent task routing OS that balances AI efficiency with human accountability — two complementary stacks merged into one repository.

---

## Repository Structure

```
merged/
├── backend/          # Node.js / Express + Anthropic Claude (JS stack)
├── reviewer/         # Python reviewer package + OpenAI-compatible LLM
└── frontend/         # Both UIs side-by-side
    ├── index.html    # Primary Dispatch Console (talks to backend/ on port 8787)
    └── trace_viz.html # Accountability Trace Viewer (talks to reviewer/ on port 8000)
```

---

## Stack A — Node.js Backend (port 8787)

**What it does:** Full pipeline — Router → Agent → Dual Reviewer (Quality + Compliance in parallel) → Escalation. SSE streaming. Task history. Human approve/reject.

### Run

```bash
cd backend
npm install
cp .env.example .env
# Edit .env: set ANTHROPIC_API_KEY=sk-ant-...
# Optional: set PASS_THRESHOLD=0.7  (reviewer confidence gate, default 0.7)
npm start
# → http://localhost:8787
```

Check: `curl http://localhost:8787/api/health`

**Without an API key**, the pipeline still runs — every stage falls back safely (Router → `human_only`, Reviewers fail closed). The demo cannot hard-fail.

### API Reference

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/health` | Backend status, model, key, pass_threshold |
| POST | `/api/process` | Batch process task (returns when done) |
| POST | `/api/process/stream` | SSE stream — steps fire as they happen |
| GET | `/api/tasks` | Task history (last 20, max 100) |
| GET | `/api/tasks/:id` | Full audit trace for one task |
| GET | `/api/metrics` | Aggregate metrics (escalation rate, avg confidence) |
| POST | `/api/human-approve` | Log human approval decision |
| POST | `/api/human-reject` | Log human rejection decision |

### Enhancements vs original (file1)

- **`PASS_THRESHOLD`** — configurable via env var (default 0.7). Reviewer verdict is overridden to FAIL if `confidence < threshold`, even if the model says "pass".
- **Per-issue `severity`** — each reviewer issue now has `severity: low|medium|high`. Any `high`-severity issue overrides the verdict to FAIL.
- **Override logging** — when the rule overrides a model "pass" verdict, the `summary` field explains why.
- **Version bumped to 2.1.0**

---

## Stack B — Python Reviewer Package (port 8000)

**What it does:** Standalone `reviewer` Python package — Router + PrimaryAgent + ReviewerAgent + HTTP server. Runs fully offline with `ScriptedLLM` (no API key needed). Supports OpenAI-compatible endpoints for live mode.

### Run

```bash
cd reviewer

# Scripted demo — all 4 scenarios, no API key:
python demo.py
python demo.py escalate         # just the escalation scenario

# HTTP server for trace_viz.html frontend:
python -m reviewer.server       # → http://localhost:8000  POST /run

# Live LLM (any OpenAI-compatible endpoint):
export OPENAI_API_KEY=sk-...    # OPENAI_BASE_URL / LLM_MODEL optional
python demo.py --live "Reconcile INV-88 $12,400 vs PO $9,900" --exposure high
```

### API Reference

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/` | Health + usage |
| GET | `/scenarios` | Bundled scripted scenarios JSON |
| POST | `/run` | Run pipeline, returns RunResult JSON |

### Use as a library

```python
from reviewer import HumanAgentOS, ReviewerAgent, LiveLLM, ScriptedLLM

# Just the reviewer:
critique = ReviewerAgent(LiveLLM()).review(task_text, agent_draft)
if not critique.passed:
    ...  # reroute with critique.issues, or escalate

# Full loop:
result = HumanAgentOS(LiveLLM(), max_retries=1, pass_threshold=0.7).run(
    {"text": "...", "risk": "medium", "reversibility": "low", "exposure": "high"})
print(result.to_dict())
```

---

## Frontend

Both UIs are in `frontend/`. Open them directly — no build step.

| File | Talks to | Purpose |
|------|----------|---------|
| `index.html` | Node.js backend (port 8787) | Primary Dispatch Console: live SSE trace, task history, human approve/reject |
| `trace_viz.html` | Python reviewer (port 8000) | Accountability Trace Viewer: offline scenarios, per-dimension scores, fix hints |

> The Dispatch Console has a **🔍 Trace Viewer →** button in the top-right that opens `trace_viz.html` in a new tab.

To point `index.html` at a deployed backend:
```html
<script>window.HAOS_API_BASE = "https://your-backend.com";</script>
```

---

## Demo script (3 scenarios, ~2 minutes)

Use the **four preset buttons** in `index.html`:

| Button | Scenario | Expected path |
|--------|----------|--------------|
| 🤖 Low-risk | Meeting transcript → action items | `agent_only`, dual review passes |
| ⚖️ Borderline | Customer refund reply | `mixed`, may retry, human sign-off |
| 🔒 High-risk | $45K wire transfer | `human_only`, instant — no AI touches it |
| 📋 Compliance | GDPR erasure response | `mixed`, compliance reviewer fires GDPR flag |

Then open `trace_viz.html` to show the **Escalate** scenario — the structured critique with per-dimension scores and fix hints, the reroute step, and the final escalation.

---

## Architecture

```
User submits task
       │
       ▼
  ┌─────────┐
  │  ROUTER  │  ← Risk score, category, route
  └─────────┘
       │
  ┌────┴──────────────────────┐
  │                           │
human_only               agent_only / mixed
  │                           │
  ▼                           ▼
Queue for human          ┌─────────┐
(no AI touches)          │  AGENT  │ ← Draft output
                         └─────────┘
                              │
                    ┌─────────┴─────────┐  (PARALLEL)
                    │                   │
             ┌──────┴──┐         ┌──────┴──────────┐
             │ Quality  │         │   Compliance    │
             │ Reviewer │         │   Reviewer      │
             └──────┬──┘         └──────┬──────────┘
                    └─────────┬─────────┘
                              │
                   Both pass? (conf≥threshold AND no high-severity)
                              │
                    YES ──────┤────── NO (retry with critique)
                              │
                    agent_only: done          Retries exhausted?
                    mixed: human sign-off           │
                                             YES → ESCALATION → Human
```

### Reviewer pass rule (legible, not a black box)

> **PASS** iff model says pass **AND** confidence ≥ threshold (default 0.7) **AND** no high-severity issue.

On any API failure, reviewers **fail safe** — they do not pass, so the task escalates for human review.

---

## Built with

| Tool | Role |
|------|------|
| **Node.js + Express** | Backend API + SSE streaming server |
| **Claude** (Anthropic) | Router, Agent, Quality Reviewer, Compliance Reviewer |
| **Python 3 stdlib** | Reviewer HTTP server (no deps for scripted mode) |
| **requests** | Python live LLM calls only |
| **Vanilla HTML/CSS/JS** | Both frontends — no framework, no build step |
| **Server-Sent Events** | Live step streaming from backend to Dispatch Console |

---

## Merge notes

| Component | Source | Action |
|-----------|--------|--------|
| `backend/server.js` | file1 (tested) | Kept + enhanced (pass_threshold, severity gate) |
| `backend/package.json` | file1 | Kept as-is |
| `backend/.env.example` | file1 | Kept as-is |
| `reviewer/reviewer/*.py` | file2/reviewer/reviewer/ | Kept as-is (canonical Python package) |
| `reviewer/demo.py` | file2/reviewer/ | Kept as-is |
| `reviewer/scenarios.json` | file2/reviewer/ | Kept as-is |
| `reviewer/sample_response_*.json` | file2/reviewer/ | Kept as-is |
| `frontend/index.html` | file1 | Kept + added Trace Viewer link button |
| `frontend/trace_viz.html` | file2/reviewer/ | Kept as-is |
| `README.md` | — | NEW unified README |
