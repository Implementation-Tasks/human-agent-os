let initialization: Promise<void> | null = null;

type OrchestraRuntime = typeof globalThis & {
  __ORCHESTRA_DB__?: D1Database;
  __ORCHESTRA_ENV__?: BedrockRuntimeConfig;
};

export interface BedrockRuntimeConfig {
  accessKeyId?: string;
  secretAccessKey?: string;
  sessionToken?: string;
  region: string;
  modelId: string;
  guardrailId?: string;
  guardrailVersion?: string;
}

const schemaStatements = [
  `CREATE TABLE IF NOT EXISTS workers (
    id TEXT PRIMARY KEY,
    kind TEXT NOT NULL,
    name TEXT NOT NULL,
    role TEXT NOT NULL,
    description TEXT NOT NULL,
    skills TEXT NOT NULL,
    availability INTEGER NOT NULL,
    cost_rate INTEGER NOT NULL,
    reliability REAL NOT NULL,
    status TEXT NOT NULL,
    initials TEXT NOT NULL,
    accent TEXT NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS tasks (
    id TEXT PRIMARY KEY,
    title TEXT NOT NULL,
    description TEXT NOT NULL,
    category TEXT NOT NULL,
    urgency TEXT NOT NULL,
    risk INTEGER NOT NULL,
    sensitivity INTEGER NOT NULL,
    judgment INTEGER NOT NULL,
    verifiability INTEGER NOT NULL,
    route TEXT NOT NULL,
    confidence REAL NOT NULL,
    status TEXT NOT NULL,
    assignee TEXT NOT NULL,
    assignee_ids TEXT NOT NULL,
    rationale TEXT NOT NULL,
    approval_required INTEGER NOT NULL,
    progress INTEGER NOT NULL,
    outcome_label TEXT NOT NULL,
    estimated_hours REAL NOT NULL,
    predicted_savings_hours REAL NOT NULL,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS approvals (
    id TEXT PRIMARY KEY,
    task_id TEXT NOT NULL,
    title TEXT NOT NULL,
    summary TEXT NOT NULL,
    requested_by TEXT NOT NULL,
    risk_level TEXT NOT NULL,
    status TEXT NOT NULL,
    due_at INTEGER NOT NULL,
    created_at INTEGER NOT NULL,
    decided_at INTEGER,
    note TEXT NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS evaluations (
    id TEXT PRIMARY KEY,
    task_id TEXT NOT NULL,
    worker_id TEXT NOT NULL,
    task_title TEXT NOT NULL,
    worker_name TEXT NOT NULL,
    route TEXT NOT NULL,
    quality REAL NOT NULL,
    speed REAL NOT NULL,
    cost_efficiency REAL NOT NULL,
    oversight REAL NOT NULL,
    outcome TEXT NOT NULL,
    created_at INTEGER NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS audit_events (
    id TEXT PRIMARY KEY,
    task_id TEXT NOT NULL,
    action TEXT NOT NULL,
    actor TEXT NOT NULL,
    detail TEXT NOT NULL,
    created_at INTEGER NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS organizations (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    slug TEXT NOT NULL,
    created_at INTEGER NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS memberships (
    id TEXT PRIMARY KEY,
    organization_id TEXT NOT NULL,
    email TEXT NOT NULL UNIQUE,
    display_name TEXT NOT NULL,
    role TEXT NOT NULL,
    status TEXT NOT NULL,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS policies (
    id TEXT PRIMARY KEY,
    organization_id TEXT NOT NULL,
    name TEXT NOT NULL,
    description TEXT NOT NULL,
    category TEXT NOT NULL,
    metric TEXT NOT NULL,
    operator TEXT NOT NULL,
    threshold INTEGER NOT NULL,
    enforcement TEXT NOT NULL,
    active INTEGER NOT NULL,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS agent_runs (
    id TEXT PRIMARY KEY,
    organization_id TEXT NOT NULL,
    task_id TEXT NOT NULL,
    agent_id TEXT NOT NULL,
    requested_by TEXT NOT NULL,
    model_id TEXT NOT NULL,
    status TEXT NOT NULL,
    prompt TEXT NOT NULL,
    output TEXT NOT NULL,
    error TEXT NOT NULL,
    input_tokens INTEGER NOT NULL,
    output_tokens INTEGER NOT NULL,
    latency_ms INTEGER NOT NULL,
    created_at INTEGER NOT NULL,
    completed_at INTEGER
  )`,
  `CREATE TABLE IF NOT EXISTS tool_calls (
    id TEXT PRIMARY KEY,
    agent_run_id TEXT NOT NULL,
    tool_name TEXT NOT NULL,
    input TEXT NOT NULL,
    output TEXT NOT NULL,
    status TEXT NOT NULL,
    duration_ms INTEGER NOT NULL,
    created_at INTEGER NOT NULL
  )`,
  "CREATE INDEX IF NOT EXISTS tasks_updated_at_idx ON tasks (updated_at)",
  "CREATE INDEX IF NOT EXISTS approvals_status_idx ON approvals (status)",
  "CREATE INDEX IF NOT EXISTS audit_task_idx ON audit_events (task_id, created_at)",
  "CREATE INDEX IF NOT EXISTS memberships_org_idx ON memberships (organization_id, role)",
  "CREATE INDEX IF NOT EXISTS policies_org_idx ON policies (organization_id, active)",
  "CREATE INDEX IF NOT EXISTS agent_runs_task_idx ON agent_runs (task_id, created_at)",
  "CREATE INDEX IF NOT EXISTS tool_calls_run_idx ON tool_calls (agent_run_id, created_at)",
];

const seedWorkers = [
  ["human-maya", "HUMAN", "Maya Chen", "Customer Strategy Lead", "Turns customer evidence into decisive product direction.", ["Customer research", "Synthesis", "Strategy", "Stakeholder communication"], 72, 95, 96, "AVAILABLE", "MC", "emerald"],
  ["human-ethan", "HUMAN", "Ethan Park", "Senior Risk Analyst", "Owns high-judgment vendor and policy decisions.", ["Vendor risk", "Compliance", "Policy review", "Due diligence"], 46, 110, 98, "LIMITED", "EP", "amber"],
  ["human-noah", "HUMAN", "Noah Patel", "Data Science Lead", "Validates quantitative work and production model decisions.", ["Model validation", "Pricing", "Forecasting", "Python"], 38, 120, 95, "LIMITED", "NP", "blue"],
  ["human-sophie", "HUMAN", "Sophie Moore", "Lifecycle Manager", "Runs thoughtful customer communication at scale.", ["Customer outreach", "CRM", "Copy review", "Campaigns"], 81, 78, 94, "AVAILABLE", "SM", "plum"],
  ["agent-research", "AI_AGENT", "Research Agent", "Evidence synthesis agent", "Collects, cites, and synthesizes structured research.", ["Customer research", "Market research", "Synthesis", "Citations"], 100, 8, 93, "ONLINE", "RA", "lime"],
  ["agent-risk", "AI_AGENT", "Risk Review Agent", "Policy and evidence checker", "Screens documents against approved risk controls.", ["Vendor risk", "Compliance", "Policy review", "Evidence checks"], 100, 12, 91, "ONLINE", "RR", "cyan"],
  ["agent-model", "AI_AGENT", "Model Auditor", "Quantitative verification agent", "Reproduces calculations and flags statistical anomalies.", ["Model validation", "Pricing", "Forecasting", "Data analysis"], 100, 14, 94, "ONLINE", "MA", "violet"],
  ["agent-outreach", "AI_AGENT", "Outreach Copilot", "Customer communication agent", "Drafts personalized, policy-safe customer messages.", ["Customer outreach", "Copywriting", "Personalization", "CRM"], 100, 6, 95, "ONLINE", "OC", "coral"],
] as const;

const now = Date.now();
const day = 86_400_000;

const seedTasks = [
  ["task-insights", "Q3 customer insight synthesis", "Synthesize 42 customer interviews into prioritized product opportunities.", "CUSTOMER_RESEARCH", "HIGH", 5, 5, 7, 8, "HYBRID", 0.89, "RUNNING", "Maya Chen + Research Agent", ["human-maya", "agent-research"], ["AI accelerates evidence synthesis", "Human judgment is required to prioritize opportunities", "Sources can be verified against interview transcripts"], 1, 82, "82% complete", 18, 11, now - day * 2, now - 1_800_000],
  ["task-vendor", "Vendor risk review", "Review a proposed analytics vendor against security and procurement policy.", "RISK_REVIEW", "HIGH", 7, 8, 7, 7, "HYBRID", 0.94, "WAITING_APPROVAL", "Risk Review Agent → Ethan Park", ["agent-risk", "human-ethan"], ["Sensitive vendor material requires human accountability", "Agent can screen evidence against policy", "High-risk findings require approval"], 1, 91, "Approval requested", 12, 7, now - day, now - 900_000],
  ["task-renewal", "Renewal outreach", "Contact 15 at-risk customers with a personalized renewal plan.", "CUSTOMER_OUTREACH", "MEDIUM", 6, 5, 8, 5, "HUMAN", 0.86, "ASSIGNED", "Sophie Moore", ["human-sophie"], ["Customer relationship context is central", "Commercial judgment is difficult to verify", "AI may assist drafting but not own the outreach"], 0, 18, "3 / 15 contacted", 10, 0, now - day * 3, now - 7_200_000],
  ["task-pricing", "Pricing model validation", "Reproduce the revised pricing model and review exceptions before launch.", "MODEL_VALIDATION", "HIGH", 7, 6, 8, 9, "HYBRID", 0.92, "RUNNING", "Noah Patel + Model Auditor", ["human-noah", "agent-model"], ["Calculations are highly verifiable", "Material pricing decisions require accountable review", "Parallel AI verification reduces cycle time"], 1, 71, "71% complete", 16, 9, now - day * 2, now - 3_600_000],
  ["task-scan", "Quarterly competitor scan", "Identify material pricing and positioning changes across eight competitors.", "MARKET_RESEARCH", "LOW", 3, 2, 4, 9, "AI_AGENT", 0.96, "COMPLETED", "Research Agent", ["agent-research"], ["Public-source research is low sensitivity", "Output can be checked against citations", "Agent has strong historical performance on this task type"], 0, 100, "Quality 95 / 100", 14, 12, now - day * 7, now - day * 5],
  ["task-refund", "Enterprise refund exception", "Decide whether to approve an out-of-policy customer refund.", "RISK_REVIEW", "URGENT", 9, 7, 9, 4, "HUMAN", 0.97, "ASSIGNED", "Ethan Park", ["human-ethan"], ["Financial impact exceeds automation threshold", "Policy exception requires accountable judgment", "Low reversibility triggers human-only routing"], 0, 5, "Decision owner assigned", 3, 0, now - 14_400_000, now - 5_400_000],
] as const;

const seedApprovals = [
  ["approval-vendor", "task-vendor", "Approve vendor risk recommendation", "The agent found two medium-severity control gaps and recommends conditional approval.", "Risk Review Agent", "HIGH", "PENDING", now + 7_200_000, now - 900_000, null, ""],
] as const;

const seedEvaluations = [
  ["eval-scan", "task-scan", "agent-research", "Quarterly competitor scan", "Research Agent", "AI_AGENT", 95, 98, 96, 100, "Accepted without revision", now - day * 5],
  ["eval-brief", "task-brief", "human-maya", "Board market brief", "Maya Chen + Research Agent", "HYBRID", 97, 91, 88, 82, "Approved after one minor edit", now - day * 8],
  ["eval-campaign", "task-campaign", "human-sophie", "Customer win-back campaign", "Sophie Moore", "HUMAN", 94, 84, 72, 100, "Exceeded response-rate target", now - day * 11],
  ["eval-policy", "task-policy", "agent-risk", "Policy evidence extraction", "Risk Review Agent", "AI_AGENT", 91, 96, 98, 92, "Two findings escalated correctly", now - day * 14],
] as const;

const seedPolicies = [
  ["policy-critical-risk", "org-northwind", "Critical risk requires a human owner", "Tasks at or above the critical risk threshold cannot be executed autonomously.", "RISK", "risk", "GTE", 8, "FORCE_HUMAN", 1],
  ["policy-restricted-data", "org-northwind", "Restricted data stays human-controlled", "Highly sensitive information cannot be sent to an autonomous agent.", "DATA", "sensitivity", "GTE", 9, "FORCE_HUMAN", 1],
  ["policy-judgment", "org-northwind", "High judgment with weak verification", "Work requiring substantial judgment must remain human-owned when outcomes are difficult to verify.", "QUALITY", "judgment", "GTE", 8, "FORCE_HUMAN", 1],
  ["policy-approval-risk", "org-northwind", "Material risk requires approval", "Agent-assisted work at or above this risk score pauses for an accountable reviewer.", "APPROVAL", "risk", "GTE", 5, "REQUIRE_APPROVAL", 1],
  ["policy-approval-data", "org-northwind", "Sensitive outputs require approval", "Agent-assisted work using sensitive data pauses before release.", "APPROVAL", "sensitivity", "GTE", 6, "REQUIRE_APPROVAL", 1],
] as const;

function getBinding() {
  const binding = (globalThis as OrchestraRuntime).__ORCHESTRA_DB__;
  if (!binding) {
    throw new Error("The workspace database binding is unavailable.");
  }
  return binding;
}

async function initialize() {
  const database = getBinding();
  await database.batch(schemaStatements.map((statement) => database.prepare(statement)));

  const organizationStatements: D1PreparedStatement[] = [
    database.prepare("INSERT OR IGNORE INTO organizations (id, name, slug, created_at) VALUES (?, ?, ?, ?)")
      .bind("org-northwind", "Northwind Operations", "northwind-operations", now),
  ];
  for (const policy of seedPolicies) {
    organizationStatements.push(database.prepare(`INSERT OR IGNORE INTO policies
      (id, organization_id, name, description, category, metric, operator, threshold, enforcement, active, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
      .bind(...policy, now, now));
  }
  await database.batch(organizationStatements);

  const existing = await database.prepare("SELECT COUNT(*) AS count FROM workers").first<{ count: number }>();
  if ((existing?.count ?? 0) > 0) return;

  const statements: D1PreparedStatement[] = [];
  for (const worker of seedWorkers) {
    statements.push(database.prepare(`INSERT OR IGNORE INTO workers
      (id, kind, name, role, description, skills, availability, cost_rate, reliability, status, initials, accent)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
      .bind(worker[0], worker[1], worker[2], worker[3], worker[4], JSON.stringify(worker[5]), worker[6], worker[7], worker[8], worker[9], worker[10], worker[11]));
  }
  for (const task of seedTasks) {
    statements.push(database.prepare(`INSERT OR IGNORE INTO tasks
      (id, title, description, category, urgency, risk, sensitivity, judgment, verifiability, route, confidence, status, assignee, assignee_ids, rationale, approval_required, progress, outcome_label, estimated_hours, predicted_savings_hours, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
      .bind(task[0], task[1], task[2], task[3], task[4], task[5], task[6], task[7], task[8], task[9], task[10], task[11], task[12], JSON.stringify(task[13]), JSON.stringify(task[14]), task[15], task[16], task[17], task[18], task[19], task[20], task[21]));
  }
  for (const approval of seedApprovals) {
    statements.push(database.prepare(`INSERT OR IGNORE INTO approvals
      (id, task_id, title, summary, requested_by, risk_level, status, due_at, created_at, decided_at, note)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
      .bind(...approval));
  }
  for (const evaluation of seedEvaluations) {
    statements.push(database.prepare(`INSERT OR IGNORE INTO evaluations
      (id, task_id, worker_id, task_title, worker_name, route, quality, speed, cost_efficiency, oversight, outcome, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
      .bind(...evaluation));
  }
  statements.push(
    database.prepare("INSERT OR IGNORE INTO audit_events (id, task_id, action, actor, detail, created_at) VALUES (?, ?, ?, ?, ?, ?)")
      .bind("audit-vendor-1", "task-vendor", "APPROVAL_REQUESTED", "Risk Review Agent", "Escalated two control gaps for accountable review.", now - 900_000),
    database.prepare("INSERT OR IGNORE INTO audit_events (id, task_id, action, actor, detail, created_at) VALUES (?, ?, ?, ?, ?, ?)")
      .bind("audit-pricing-1", "task-pricing", "TOOL_COMPLETED", "Model Auditor", "Reproduced 18 of 24 pricing scenarios with no variance.", now - 3_600_000),
    database.prepare("INSERT OR IGNORE INTO audit_events (id, task_id, action, actor, detail, created_at) VALUES (?, ?, ?, ?, ?, ?)")
      .bind("audit-insight-1", "task-insights", "EVIDENCE_SYNTHESIZED", "Research Agent", "Clustered 42 interviews into six validated themes.", now - 1_800_000),
  );
  await database.batch(statements);
}

export async function ensureDatabase() {
  initialization ??= initialize().catch((error) => {
    initialization = null;
    throw error;
  });
  return initialization;
}

export function getRawDatabase() {
  return getBinding();
}

export function setDatabaseBinding(binding?: D1Database) {
  if (binding) (globalThis as OrchestraRuntime).__ORCHESTRA_DB__ = binding;
}

export function setRuntimeConfig(config: BedrockRuntimeConfig) {
  (globalThis as OrchestraRuntime).__ORCHESTRA_ENV__ = config;
}

export function getRuntimeConfig(): BedrockRuntimeConfig {
  return (globalThis as OrchestraRuntime).__ORCHESTRA_ENV__ ?? {
    region: "us-east-1",
    modelId: "amazon.nova-pro-v1:0",
  };
}
