import { integer, real, sqliteTable, text } from "drizzle-orm/sqlite-core";

export const workers = sqliteTable("workers", {
  id: text("id").primaryKey(),
  kind: text("kind").notNull(),
  name: text("name").notNull(),
  role: text("role").notNull(),
  description: text("description").notNull(),
  skills: text("skills").notNull(),
  availability: integer("availability").notNull(),
  costRate: integer("cost_rate").notNull(),
  reliability: real("reliability").notNull(),
  status: text("status").notNull(),
  initials: text("initials").notNull(),
  accent: text("accent").notNull(),
});

export const tasks = sqliteTable("tasks", {
  id: text("id").primaryKey(),
  title: text("title").notNull(),
  description: text("description").notNull(),
  category: text("category").notNull(),
  urgency: text("urgency").notNull(),
  risk: integer("risk").notNull(),
  sensitivity: integer("sensitivity").notNull(),
  judgment: integer("judgment").notNull(),
  verifiability: integer("verifiability").notNull(),
  route: text("route").notNull(),
  confidence: real("confidence").notNull(),
  status: text("status").notNull(),
  assignee: text("assignee").notNull(),
  assigneeIds: text("assignee_ids").notNull(),
  rationale: text("rationale").notNull(),
  approvalRequired: integer("approval_required", { mode: "boolean" }).notNull(),
  progress: integer("progress").notNull(),
  outcomeLabel: text("outcome_label").notNull(),
  estimatedHours: real("estimated_hours").notNull(),
  predictedSavingsHours: real("predicted_savings_hours").notNull(),
  createdAt: integer("created_at").notNull(),
  updatedAt: integer("updated_at").notNull(),
});

export const approvals = sqliteTable("approvals", {
  id: text("id").primaryKey(),
  taskId: text("task_id").notNull(),
  title: text("title").notNull(),
  summary: text("summary").notNull(),
  requestedBy: text("requested_by").notNull(),
  riskLevel: text("risk_level").notNull(),
  status: text("status").notNull(),
  dueAt: integer("due_at").notNull(),
  createdAt: integer("created_at").notNull(),
  decidedAt: integer("decided_at"),
  note: text("note").notNull(),
});

export const evaluations = sqliteTable("evaluations", {
  id: text("id").primaryKey(),
  taskId: text("task_id").notNull(),
  workerId: text("worker_id").notNull(),
  taskTitle: text("task_title").notNull(),
  workerName: text("worker_name").notNull(),
  route: text("route").notNull(),
  quality: real("quality").notNull(),
  speed: real("speed").notNull(),
  costEfficiency: real("cost_efficiency").notNull(),
  oversight: real("oversight").notNull(),
  outcome: text("outcome").notNull(),
  createdAt: integer("created_at").notNull(),
});

export const auditEvents = sqliteTable("audit_events", {
  id: text("id").primaryKey(),
  taskId: text("task_id").notNull(),
  action: text("action").notNull(),
  actor: text("actor").notNull(),
  detail: text("detail").notNull(),
  createdAt: integer("created_at").notNull(),
});

export const organizations = sqliteTable("organizations", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  slug: text("slug").notNull(),
  createdAt: integer("created_at").notNull(),
});

export const memberships = sqliteTable("memberships", {
  id: text("id").primaryKey(),
  organizationId: text("organization_id").notNull(),
  email: text("email").notNull().unique(),
  displayName: text("display_name").notNull(),
  role: text("role").notNull(),
  status: text("status").notNull(),
  createdAt: integer("created_at").notNull(),
  updatedAt: integer("updated_at").notNull(),
});

export const policies = sqliteTable("policies", {
  id: text("id").primaryKey(),
  organizationId: text("organization_id").notNull(),
  name: text("name").notNull(),
  description: text("description").notNull(),
  category: text("category").notNull(),
  metric: text("metric").notNull(),
  operator: text("operator").notNull(),
  threshold: integer("threshold").notNull(),
  enforcement: text("enforcement").notNull(),
  active: integer("active", { mode: "boolean" }).notNull(),
  createdAt: integer("created_at").notNull(),
  updatedAt: integer("updated_at").notNull(),
});

export const agentRuns = sqliteTable("agent_runs", {
  id: text("id").primaryKey(),
  organizationId: text("organization_id").notNull(),
  taskId: text("task_id").notNull(),
  agentId: text("agent_id").notNull(),
  requestedBy: text("requested_by").notNull(),
  modelId: text("model_id").notNull(),
  status: text("status").notNull(),
  prompt: text("prompt").notNull(),
  output: text("output").notNull(),
  error: text("error").notNull(),
  inputTokens: integer("input_tokens").notNull(),
  outputTokens: integer("output_tokens").notNull(),
  latencyMs: integer("latency_ms").notNull(),
  createdAt: integer("created_at").notNull(),
  completedAt: integer("completed_at"),
});

export const toolCalls = sqliteTable("tool_calls", {
  id: text("id").primaryKey(),
  agentRunId: text("agent_run_id").notNull(),
  toolName: text("tool_name").notNull(),
  input: text("input").notNull(),
  output: text("output").notNull(),
  status: text("status").notNull(),
  durationMs: integer("duration_ms").notNull(),
  createdAt: integer("created_at").notNull(),
});
