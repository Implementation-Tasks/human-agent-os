import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import { randomUUID } from "crypto";

dotenv.config();

const app = express();
app.use(cors());
app.use(express.json({ limit: "1mb" }));

const PORT = process.env.PORT || 8787;
const MODEL = process.env.CLAUDE_MODEL || "claude-3-5-sonnet-20241022";
const API_KEY = process.env.ANTHROPIC_API_KEY;
const ANTHROPIC_URL = "https://api.anthropic.com/v1/messages";
const MAX_RETRIES = 1;
// Configurable pass threshold (0.0–1.0). Reviewer verdict is overridden to FAIL
// if confidence < threshold — even if the model says "pass". Default 0.7.
const PASS_THRESHOLD = parseFloat(process.env.PASS_THRESHOLD || "0.7");

// ---------------------------------------------------------------------------
// IN-MEMORY STORE — task history + metrics
// ---------------------------------------------------------------------------
const taskStore = new Map(); // id -> taskRecord
const metrics = {
  totalTasks: 0,
  byRoute: { human_only: 0, agent_only: 0, mixed: 0, escalated_to_human: 0 },
  totalEscalations: 0,
  totalRetries: 0,
  avgConfidence: 0,
  confidenceSamples: [],
};

function updateMetrics(result) {
  metrics.totalTasks++;
  const route = result.finalRoute || "human_only";
  if (metrics.byRoute[route] !== undefined) metrics.byRoute[route]++;
  if (result.escalated) metrics.totalEscalations++;

  const reviewerSteps = (result.steps || []).filter((s) => s.step === "reviewer");
  reviewerSteps.forEach((r) => {
    if (typeof r.confidence === "number") {
      metrics.confidenceSamples.push(r.confidence);
    }
  });
  if (metrics.confidenceSamples.length > 0) {
    metrics.avgConfidence =
      metrics.confidenceSamples.reduce((a, b) => a + b, 0) /
      metrics.confidenceSamples.length;
  }

  const retries = (result.steps || []).filter(
    (s) => s.step === "agent" && s.attempt > 1
  ).length;
  metrics.totalRetries += retries;
}

// ---------------------------------------------------------------------------
// LOW-LEVEL CLAUDE CALL — JSON-only, with graceful fallback
// (Kept as-is from file1 — tested end-to-end, JSON fallback verified)
// ---------------------------------------------------------------------------
async function callClaude(systemPrompt, userPrompt, { timeoutMs = 25000 } = {}) {
  if (!API_KEY) {
    return { ok: false, fallback: true, reason: "no_api_key", data: null };
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const res = await fetch(ANTHROPIC_URL, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": API_KEY,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: 1024,
        system: systemPrompt,
        messages: [{ role: "user", content: userPrompt }],
      }),
      signal: controller.signal,
    });

    clearTimeout(timer);

    if (!res.ok) {
      const text = await res.text().catch(() => "");
      return {
        ok: false,
        fallback: true,
        reason: `http_${res.status}`,
        data: null,
        raw: text,
      };
    }

    const data = await res.json();
    const text = (data.content || [])
      .filter((b) => b.type === "text")
      .map((b) => b.text)
      .join("\n")
      .trim();

    const cleaned = text.replace(/^```json\s*|^```\s*|```$/gm, "").trim();

    try {
      const parsed = JSON.parse(cleaned);
      return { ok: true, fallback: false, data: parsed };
    } catch {
      return {
        ok: false,
        fallback: true,
        reason: "json_parse_error",
        data: null,
        raw: text,
      };
    }
  } catch (err) {
    clearTimeout(timer);
    const reason = err.name === "AbortError" ? "timeout" : "network_error";
    return { ok: false, fallback: true, reason, data: null };
  }
}

// ---------------------------------------------------------------------------
// ROUTER — classifies task into one of 3 execution paths
// (Kept as-is from file1 — tested)
// ---------------------------------------------------------------------------
async function routeTask(task, riskHint) {
  const system = `You are the Router of a Human Agent OS. Your job is to decide which execution path handles a given task.

Classify into exactly one of:
- "human_only": High risk, legally/financially/medically sensitive, irreversible, requires accountability AI cannot bear (wire transfers, final legal approvals, medical decisions, HR terminations, public commitments).
- "agent_only": Low-risk, well-specified, easily verifiable, reversible tasks (summarization, drafting internal docs, data lookups, formatting).
- "mixed": AI can produce a useful draft but a human must confirm before it's final (customer-facing communications with money involved, policy interpretations, external commitments).

Also assign a risk score 1-10 and identify the primary risk category.

Respond with ONLY valid JSON, no markdown fences:
{"route": "human_only"|"agent_only"|"mixed", "reasoning": "one sentence, plain English", "riskScore": 1-10, "riskCategory": "financial"|"legal"|"reputational"|"operational"|"none"}`;

  const user = `Task: ${task}\nRisk hint from submitter: ${riskHint || "none"}`;

  const result = await callClaude(system, user);

  if (!result.ok) {
    return {
      route: "human_only",
      reasoning: `Fallback routing: classifier unavailable (${result.reason}), defaulted to human_only for safety.`,
      riskScore: 10,
      riskCategory: "operational",
      fallback: true,
    };
  }

  const valid = ["human_only", "agent_only", "mixed"];
  const route = valid.includes(result.data.route) ? result.data.route : "human_only";

  return {
    route,
    reasoning: result.data.reasoning || "(no reasoning returned)",
    riskScore: result.data.riskScore || 5,
    riskCategory: result.data.riskCategory || "operational",
    fallback: false,
  };
}

// ---------------------------------------------------------------------------
// AGENT — produces draft output, fixing prior issues if any
// (Kept as-is from file1 — tested)
// ---------------------------------------------------------------------------
async function runAgent(task, priorIssues) {
  const system = `You are the Execution Agent of a Human Agent OS. Produce a clear, concrete draft output for the given task.
If prior reviewer issues are listed, address each one explicitly in your revised output.
Be specific — vague outputs will be rejected by the Reviewer.
Respond with ONLY valid JSON, no markdown fences:
{"output": "the draft result (plain text, complete and actionable)", "approach": "one-sentence description of how you handled the task"}`;

  const user = priorIssues
    ? `Task: ${task}\n\nPrior reviewer issues to fix:\n${priorIssues.map((i, n) => `${n + 1}. ${i}`).join("\n")}`
    : `Task: ${task}`;

  const result = await callClaude(system, user);

  if (!result.ok) {
    return { output: null, approach: null, fallback: true, reason: result.reason };
  }

  return {
    output: result.data.output || "(empty output)",
    approach: result.data.approach || "",
    fallback: false,
  };
}

// ---------------------------------------------------------------------------
// QUALITY REVIEWER — checks correctness, completeness, risk
// ENHANCED: now requests confidence + per-issue severity; applies PASS_THRESHOLD
// ---------------------------------------------------------------------------
async function reviewQuality(task, draftOutput) {
  const system = `You are the Quality Reviewer Agent of a Human Agent OS. Critically evaluate the draft output.
Check for: factual correctness, completeness (does it fully answer the task?), clarity, and any risk of harm if used as-is.
Be genuinely critical — do not rubber-stamp. A borderline output should fail.
Respond with ONLY valid JSON, no markdown fences:
{"pass": true|false, "issues": [{"detail": "specific issue", "severity": "low"|"medium"|"high"}], "confidence": 0.0-1.0, "summary": "one sentence verdict"}`;

  const user = `Task: ${task}\nDraft output: ${draftOutput}`;

  const result = await callClaude(system, user);

  if (!result.ok) {
    return {
      pass: false,
      issues: [{ detail: `Quality reviewer unavailable (${result.reason}). Failing closed.`, severity: "high" }],
      confidence: 0,
      summary: "Fallback: reviewer unavailable",
      fallback: true,
      type: "quality",
    };
  }

  const rawIssues = Array.isArray(result.data.issues) ? result.data.issues : [];
  const issues = rawIssues.map((i) =>
    typeof i === "string"
      ? { detail: i, severity: "medium" }
      : { detail: i.detail || String(i), severity: i.severity || "medium" }
  );

  const confidence = typeof result.data.confidence === "number"
    ? Math.max(0, Math.min(1, result.data.confidence))
    : 0;

  const hasHighSeverity = issues.some((i) => i.severity === "high");
  const modelSaysPass = !!result.data.pass;

  // Legible pass rule (from Python reviewer): model_pass AND conf>=threshold AND no high-severity
  const pass = modelSaysPass && confidence >= PASS_THRESHOLD && !hasHighSeverity;

  let summary = result.data.summary || "";
  if (!pass && modelSaysPass) {
    if (hasHighSeverity) summary = `Overridden to FAIL: high-severity issue present. ${summary}`.trim();
    else if (confidence < PASS_THRESHOLD) summary = `Overridden to FAIL: confidence ${confidence.toFixed(2)} < threshold ${PASS_THRESHOLD.toFixed(2)}. ${summary}`.trim();
  }

  return {
    pass,
    issues,
    confidence,
    summary,
    fallback: false,
    type: "quality",
  };
}

// ---------------------------------------------------------------------------
// COMPLIANCE REVIEWER — checks policy/legal/ethical risk
// ENHANCED: now requests confidence + per-issue severity; applies PASS_THRESHOLD
// ---------------------------------------------------------------------------
async function reviewCompliance(task, draftOutput) {
  const system = `You are the Compliance Reviewer Agent of a Human Agent OS. Your job is to identify regulatory, legal, or ethical risk in an AI-generated output before it reaches an end user.
Check for: regulatory violations, legally binding language an AI should not commit to, discriminatory or harmful framing, privacy issues, commitments exceeding authority.
Respond with ONLY valid JSON, no markdown fences:
{"pass": true|false, "issues": [{"detail": "compliance issue", "severity": "low"|"medium"|"high"}], "riskFlags": ["GDPR"|"legal_commitment"|"financial_exposure"|"discrimination"|"none"], "confidence": 0.0-1.0, "summary": "one sentence compliance verdict"}`;

  const user = `Task: ${task}\nDraft output: ${draftOutput}`;

  const result = await callClaude(system, user);

  if (!result.ok) {
    return {
      pass: false,
      issues: [{ detail: `Compliance reviewer unavailable (${result.reason}). Failing closed.`, severity: "high" }],
      riskFlags: [],
      confidence: 0,
      summary: "Fallback: compliance reviewer unavailable",
      fallback: true,
      type: "compliance",
    };
  }

  const rawIssues = Array.isArray(result.data.issues) ? result.data.issues : [];
  const issues = rawIssues.map((i) =>
    typeof i === "string"
      ? { detail: i, severity: "medium" }
      : { detail: i.detail || String(i), severity: i.severity || "medium" }
  );

  const confidence = typeof result.data.confidence === "number"
    ? Math.max(0, Math.min(1, result.data.confidence))
    : 0;

  const hasHighSeverity = issues.some((i) => i.severity === "high");
  const modelSaysPass = !!result.data.pass;

  // Legible pass rule (from Python reviewer): model_pass AND conf>=threshold AND no high-severity
  const pass = modelSaysPass && confidence >= PASS_THRESHOLD && !hasHighSeverity;

  let summary = result.data.summary || "";
  if (!pass && modelSaysPass) {
    if (hasHighSeverity) summary = `Overridden to FAIL: high-severity issue present. ${summary}`.trim();
    else if (confidence < PASS_THRESHOLD) summary = `Overridden to FAIL: confidence ${confidence.toFixed(2)} < threshold ${PASS_THRESHOLD.toFixed(2)}. ${summary}`.trim();
  }

  return {
    pass,
    issues,
    riskFlags: Array.isArray(result.data.riskFlags) ? result.data.riskFlags : [],
    confidence,
    summary,
    fallback: false,
    type: "compliance",
  };
}

// ---------------------------------------------------------------------------
// PIPELINE ORCHESTRATION — the core loop (emits steps to SSE or collects all)
// (Kept as-is from file1 — tested)
// ---------------------------------------------------------------------------
async function* processTaskStream(task, riskHint) {
  const t0 = Date.now();
  const taskId = randomUUID();

  yield { event: "task_start", data: { taskId, task, timestamp: 0 } };

  // STEP 1: Router
  const routing = await routeTask(task, riskHint);
  const routerStep = { step: "router", ...routing, timestamp: Date.now() - t0 };
  yield { event: "step", data: routerStep };

  if (routing.route === "human_only") {
    const result = {
      taskId,
      task,
      steps: [routerStep],
      finalRoute: "human_only",
      finalOutput: null,
      needsHuman: true,
      status: "awaiting_human",
      escalated: false,
      totalMs: Date.now() - t0,
    };
    yield { event: "complete", data: result };
    return result;
  }

  // STEP 2: Agent → dual Reviewer loop (max 1 retry)
  let attempt = 1;
  let priorIssues = null;
  let lastOutput = null;
  let lastApproach = null;
  let escalated = false;
  const allSteps = [routerStep];

  while (attempt <= MAX_RETRIES + 1) {
    const agentResult = await runAgent(task, priorIssues);
    const agentStep = { step: "agent", attempt, ...agentResult, timestamp: Date.now() - t0 };
    allSteps.push(agentStep);
    yield { event: "step", data: agentStep };

    if (agentResult.fallback) {
      const escalationStep = {
        step: "escalation",
        reason: `Agent unavailable on attempt ${attempt} (${agentResult.reason}). Escalating to human for safety.`,
        timestamp: Date.now() - t0,
      };
      allSteps.push(escalationStep);
      yield { event: "step", data: escalationStep };
      escalated = true;
      break;
    }

    lastOutput = agentResult.output;
    lastApproach = agentResult.approach;

    // Dual reviewer — run in parallel (kept from file1)
    const [qualityReview, complianceReview] = await Promise.all([
      reviewQuality(task, agentResult.output),
      reviewCompliance(task, agentResult.output),
    ]);

    const qualityStep = {
      step: "reviewer",
      reviewType: "quality",
      attempt,
      ...qualityReview,
      timestamp: Date.now() - t0,
    };
    const complianceStep = {
      step: "reviewer",
      reviewType: "compliance",
      attempt,
      ...complianceReview,
      timestamp: Date.now() - t0,
    };
    allSteps.push(qualityStep, complianceStep);
    yield { event: "step", data: qualityStep };
    yield { event: "step", data: complianceStep };

    const bothPass = qualityReview.pass && complianceReview.pass;

    if (bothPass) {
      break; // success
    }

    if (attempt > MAX_RETRIES) {
      const combinedIssues = [
        ...qualityReview.issues.map((i) => `[Quality/${i.severity}] ${i.detail}`),
        ...complianceReview.issues.map((i) => `[Compliance/${i.severity}] ${i.detail}`),
      ].filter(Boolean);

      const escalationStep = {
        step: "escalation",
        reason: `Dual review failed after ${attempt} attempt(s). Escalating to human accountability chain.`,
        issues: combinedIssues,
        timestamp: Date.now() - t0,
      };
      allSteps.push(escalationStep);
      yield { event: "step", data: escalationStep };
      escalated = true;
      break;
    }

    // Feed combined issues back to agent for retry
    priorIssues = [
      ...qualityReview.issues.map((i) => `[Quality/${i.severity}] ${i.detail}`),
      ...complianceReview.issues.map((i) => `[Compliance/${i.severity}] ${i.detail}`),
    ].filter(Boolean);

    attempt += 1;
  }

  const finalRoute = escalated ? "escalated_to_human" : routing.route;
  const result = {
    taskId,
    task,
    steps: allSteps,
    finalRoute,
    finalOutput: lastOutput,
    finalApproach: lastApproach,
    needsHuman: escalated || routing.route === "mixed",
    status: escalated
      ? "awaiting_human"
      : routing.route === "mixed"
      ? "awaiting_human_signoff"
      : "complete",
    escalated,
    totalMs: Date.now() - t0,
    retries: attempt - 1,
  };

  yield { event: "complete", data: result };
  return result;
}

// ---------------------------------------------------------------------------
// NON-STREAMING VERSION — collects all steps, returns whole result
// ---------------------------------------------------------------------------
async function processTask(task, riskHint) {
  let finalResult = null;
  for await (const { event, data } of processTaskStream(task, riskHint)) {
    if (event === "complete") finalResult = data;
  }
  return finalResult;
}

// ---------------------------------------------------------------------------
// ROUTES
// ---------------------------------------------------------------------------

// Health
app.get("/api/health", (req, res) => {
  res.json({
    ok: true,
    model: MODEL,
    hasApiKey: !!API_KEY,
    version: "2.1.0",
    passThreshold: PASS_THRESHOLD,
    features: ["dual-reviewer", "sse-streaming", "task-history", "compliance-check", "pass-threshold", "severity-gate"],
  });
});

// Non-streaming process (for backwards compat)
app.post("/api/process", async (req, res) => {
  const { task, riskHint } = req.body || {};
  if (!task || typeof task !== "string") {
    return res.status(400).json({ error: "Field 'task' (string) is required." });
  }
  try {
    const result = await processTask(task, riskHint);
    taskStore.set(result.taskId, result);
    updateMetrics(result);
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: "Pipeline crashed unexpectedly.", detail: String(err) });
  }
});

// SSE streaming process — the showcase endpoint
app.post("/api/process/stream", async (req, res) => {
  const { task, riskHint } = req.body || {};
  if (!task || typeof task !== "string") {
    res.writeHead(400, { "Content-Type": "application/json" });
    return res.end(JSON.stringify({ error: "Field 'task' (string) is required." }));
  }

  res.writeHead(200, {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache",
    Connection: "keep-alive",
    "Access-Control-Allow-Origin": "*",
  });

  const send = (event, data) => {
    res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
  };

  try {
    let finalResult = null;
    for await (const { event, data } of processTaskStream(task, riskHint)) {
      send(event, data);
      if (event === "complete") finalResult = data;
    }
    if (finalResult) {
      taskStore.set(finalResult.taskId, finalResult);
      updateMetrics(finalResult);
    }
  } catch (err) {
    send("error", { message: String(err) });
  } finally {
    res.end();
  }
});

// Task history
app.get("/api/tasks", (req, res) => {
  const limit = Math.min(parseInt(req.query.limit) || 20, 100);
  const tasks = [...taskStore.values()]
    .sort((a, b) => (b.totalMs || 0) - (a.totalMs || 0))
    .slice(0, limit)
    .map((t) => ({
      taskId: t.taskId,
      task: t.task.slice(0, 80) + (t.task.length > 80 ? "…" : ""),
      finalRoute: t.finalRoute,
      status: t.status,
      escalated: t.escalated,
      retries: t.retries,
      totalMs: t.totalMs,
    }));
  res.json({ tasks, total: taskStore.size });
});

// Single task audit log
app.get("/api/tasks/:id", (req, res) => {
  const record = taskStore.get(req.params.id);
  if (!record) return res.status(404).json({ error: "Task not found." });
  res.json(record);
});

// System metrics
app.get("/api/metrics", (req, res) => {
  res.json({
    ...metrics,
    escalationRate:
      metrics.totalTasks > 0
        ? ((metrics.totalEscalations / metrics.totalTasks) * 100).toFixed(1)
        : "0.0",
    avgRetries:
      metrics.totalTasks > 0
        ? (metrics.totalRetries / metrics.totalTasks).toFixed(2)
        : "0.00",
  });
});

// Human approve endpoint
app.post("/api/human-approve", (req, res) => {
  const { taskId, task, finalOutput, approvedBy } = req.body || {};

  if (taskId && taskStore.has(taskId)) {
    const record = taskStore.get(taskId);
    record.status = "human_approved";
    record.approvedAt = new Date().toISOString();
    record.approvedBy = approvedBy || "human_operator";
    taskStore.set(taskId, record);
  }

  res.json({
    taskId,
    task,
    finalOutput,
    approvedAt: new Date().toISOString(),
    approvedBy: approvedBy || "human_operator",
    status: "human_approved",
  });
});

// Human reject endpoint
app.post("/api/human-reject", (req, res) => {
  const { taskId, rejectionReason } = req.body || {};

  if (taskId && taskStore.has(taskId)) {
    const record = taskStore.get(taskId);
    record.status = "human_rejected";
    record.rejectedAt = new Date().toISOString();
    record.rejectionReason = rejectionReason || "";
    taskStore.set(taskId, record);
  }

  res.json({ taskId, status: "human_rejected", rejectedAt: new Date().toISOString() });
});

app.listen(PORT, () => {
  console.log(`\n🚀 Human Agent OS v2.1 — Backend running on http://localhost:${PORT}`);
  console.log(`   Model: ${MODEL}`);
  console.log(`   API key configured: ${!!API_KEY}`);
  console.log(`   Pass threshold: ${PASS_THRESHOLD}`);
  console.log(`   Features: dual-reviewer | SSE streaming | task history | compliance-check | pass-threshold | severity-gate\n`);
});
