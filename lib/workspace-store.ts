import { and, desc, eq } from "drizzle-orm";
import { getDb } from "@/db";
import { ensureDatabase } from "@/db/runtime";
import {
  approvals as approvalsTable,
  auditEvents as auditEventsTable,
  evaluations as evaluationsTable,
  policies as policiesTable,
  tasks as tasksTable,
  workers as workersTable,
} from "@/db/schema";
import type {
  Approval,
  AuditEvent,
  CreateTaskInput,
  Evaluation,
  OrganizationPolicy,
  RouteMode,
  RoutingDecision,
  Task,
  Worker,
  WorkspaceCore,
} from "@/lib/types";

const categorySkills: Record<string, string[]> = {
  CUSTOMER_RESEARCH: ["customer research", "synthesis", "strategy"],
  MARKET_RESEARCH: ["market research", "research", "citations", "synthesis"],
  RISK_REVIEW: ["vendor risk", "compliance", "policy review", "evidence checks"],
  MODEL_VALIDATION: ["model validation", "pricing", "forecasting", "data analysis"],
  CUSTOMER_OUTREACH: ["customer outreach", "copywriting", "crm", "campaigns"],
  GENERAL: ["synthesis", "strategy", "evidence checks"],
};

function parseJson<T>(value: string, fallback: T): T {
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}

function normalizeWorker(row: typeof workersTable.$inferSelect): Worker {
  return {
    ...row,
    kind: row.kind as Worker["kind"],
    skills: parseJson<string[]>(row.skills, []),
  };
}

function normalizeTask(row: typeof tasksTable.$inferSelect): Task {
  return {
    ...row,
    route: row.route as RouteMode,
    assigneeIds: parseJson<string[]>(row.assigneeIds, []),
    rationale: parseJson<string[]>(row.rationale, []),
  };
}

function normalizeApproval(row: typeof approvalsTable.$inferSelect): Approval {
  return row;
}

function normalizeEvaluation(row: typeof evaluationsTable.$inferSelect): Evaluation {
  return { ...row, route: row.route as RouteMode };
}

function normalizeAuditEvent(row: typeof auditEventsTable.$inferSelect): AuditEvent {
  return row;
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function policyMetric(input: CreateTaskInput, metric: string) {
  if (metric === "risk") return input.risk;
  if (metric === "sensitivity") return input.sensitivity;
  if (metric === "judgment") return input.judgment;
  if (metric === "verifiability") return input.verifiability;
  return 0;
}

function policyMatches(input: CreateTaskInput, policy: OrganizationPolicy) {
  if (!policy.active) return false;
  if (policy.metric === "judgment" && input.verifiability > 5) return false;
  const value = policyMetric(input, policy.metric);
  return policy.operator === "LTE" ? value <= policy.threshold : value >= policy.threshold;
}

function decideRoute(input: CreateTaskInput, organizationPolicies: OrganizationPolicy[]): Omit<RoutingDecision, "assignee"> {
  const forceHumanPolicies = organizationPolicies.filter((policy) => policy.enforcement === "FORCE_HUMAN" && policyMatches(input, policy));
  const hardHumanGate = forceHumanPolicies.length > 0 || input.risk >= 10 || input.sensitivity >= 10;

  if (hardHumanGate) {
    return {
      route: "HUMAN",
      confidence: clamp(0.82 + Math.max(input.risk - 7, input.judgment - 7) * 0.04, 0.82, 0.98),
      policyGate: "Human accountability required",
      predictedSavingsHours: 0,
      rationale: [
        forceHumanPolicies[0]?.name ?? "A platform safety limit requires a human owner",
        forceHumanPolicies[1]?.name ?? "A named human remains accountable for the outcome",
        "AI assistance can be added later within approved boundaries",
      ],
    };
  }

  const automationReady =
    input.risk <= 4 &&
    input.sensitivity <= 4 &&
    input.judgment <= 5 &&
    input.verifiability >= 6;

  if (automationReady) {
    return {
      route: "AI_AGENT",
      confidence: clamp(0.83 + (input.verifiability - 6) * 0.025 + (4 - input.risk) * 0.02, 0.83, 0.97),
      policyGate: "Autonomous execution allowed",
      predictedSavingsHours: Math.round(input.estimatedHours * 0.78 * 10) / 10,
      rationale: [
        "The task is low risk and within approved data boundaries",
        "Success can be checked against objective evidence",
        "An approved agent has strong capability fit for this work",
      ],
    };
  }

  return {
    route: "HYBRID",
    confidence: clamp(0.84 + (input.verifiability >= 7 ? 0.04 : 0) + (input.judgment >= 7 ? 0.03 : 0), 0.84, 0.95),
    policyGate: "Human checkpoint required",
    predictedSavingsHours: Math.round(input.estimatedHours * 0.56 * 10) / 10,
    rationale: [
      "AI can accelerate repeatable analysis and drafting",
      "Human judgment or sensitive context remains material",
      "A required approval checkpoint limits operational risk",
    ],
  };
}

function candidateScore(worker: Worker, input: CreateTaskInput) {
  const targets = categorySkills[input.category] ?? categorySkills.GENERAL;
  const skills = worker.skills.map((skill) => skill.toLowerCase());
  const matches = targets.filter((target) => skills.some((skill) => skill.includes(target) || target.includes(skill))).length;
  return matches * 30 + worker.reliability * 0.45 + worker.availability * 0.12 - worker.costRate * 0.025;
}

function selectAssignees(workers: Worker[], route: RouteMode, input: CreateTaskInput) {
  const ranked = (kind: Worker["kind"]) =>
    workers
      .filter((worker) => worker.kind === kind)
      .sort((a, b) => candidateScore(b, input) - candidateScore(a, input));

  const humans = ranked("HUMAN");
  const agents = ranked("AI_AGENT");

  if (route === "HUMAN") return { assignee: humans[0]?.name ?? "Workforce manager", ids: humans[0] ? [humans[0].id] : [] };
  if (route === "AI_AGENT") return { assignee: agents[0]?.name ?? "Approved agent", ids: agents[0] ? [agents[0].id] : [] };
  return {
    assignee: `${humans[0]?.name ?? "Human reviewer"} + ${agents[0]?.name ?? "Approved agent"}`,
    ids: [humans[0]?.id, agents[0]?.id].filter(Boolean) as string[],
  };
}

export async function getWorkspace(): Promise<WorkspaceCore> {
  await ensureDatabase();
  const db = getDb();
  const [workerRows, taskRows, approvalRows, evaluationRows, auditRows] = await Promise.all([
    db.select().from(workersTable),
    db.select().from(tasksTable).orderBy(desc(tasksTable.updatedAt)),
    db.select().from(approvalsTable).orderBy(desc(approvalsTable.createdAt)),
    db.select().from(evaluationsTable).orderBy(desc(evaluationsTable.createdAt)),
    db.select().from(auditEventsTable).orderBy(desc(auditEventsTable.createdAt)).limit(80),
  ]);

  const workers = workerRows.map(normalizeWorker);
  const tasks = taskRows.map(normalizeTask);
  const approvals = approvalRows.map(normalizeApproval);
  const evaluations = evaluationRows.map(normalizeEvaluation);
  const auditEvents = auditRows.map(normalizeAuditEvent);
  const active = tasks.filter((task) => task.status !== "COMPLETED");
  const aiEvaluations = evaluations.filter((evaluation) => evaluation.route !== "HUMAN");
  const aiSuccessRate = aiEvaluations.length
    ? Math.round((aiEvaluations.reduce((sum, evaluation) => sum + evaluation.quality, 0) / aiEvaluations.length) * 10) / 10
    : 0;
  const hoursSaved = Math.round(tasks.reduce((sum, task) => sum + task.predictedSavingsHours, 0));
  const routeCount = (route: RouteMode) => tasks.filter((task) => task.route === route).length;

  return {
    workers,
    tasks,
    approvals,
    evaluations,
    auditEvents,
    summary: {
      activeTasks: active.length,
      aiSuccessRate,
      pendingApprovals: approvals.filter((approval) => approval.status === "PENDING").length,
      valueDelivered: 142_000 + hoursSaved * 1_250 + evaluations.length * 4_500,
      hoursSaved,
      routeMix: {
        human: routeCount("HUMAN"),
        ai: routeCount("AI_AGENT"),
        hybrid: routeCount("HYBRID"),
      },
    },
  };
}

export async function createTask(input: CreateTaskInput, organizationId = "org-northwind") {
  await ensureDatabase();
  const db = getDb();
  const workerRows = await db.select().from(workersTable);
  const workers = workerRows.map(normalizeWorker);
  const policyRows = await db.select().from(policiesTable).where(eq(policiesTable.organizationId, organizationId));
  const organizationPolicies = policyRows.map((row) => row as OrganizationPolicy);
  const baseDecision = decideRoute(input, organizationPolicies);
  const selected = selectAssignees(workers, baseDecision.route, input);
  const decision: RoutingDecision = { ...baseDecision, assignee: selected.assignee };
  const timestamp = Date.now();
  const id = `task-${crypto.randomUUID()}`;
  const status = decision.route === "HUMAN" ? "ASSIGNED" : "RUNNING";
  const approvalRequired = decision.route === "HYBRID" || organizationPolicies.some((policy) => policy.enforcement === "REQUIRE_APPROVAL" && policyMatches(input, policy));

  await db.insert(tasksTable).values({
    id,
    title: input.title.trim(),
    description: input.description.trim(),
    category: input.category,
    urgency: input.urgency,
    risk: input.risk,
    sensitivity: input.sensitivity,
    judgment: input.judgment,
    verifiability: input.verifiability,
    route: decision.route,
    confidence: decision.confidence,
    status,
    assignee: selected.assignee,
    assigneeIds: JSON.stringify(selected.ids),
    rationale: JSON.stringify(decision.rationale),
    approvalRequired,
    progress: status === "ASSIGNED" ? 5 : 12,
    outcomeLabel: status === "ASSIGNED" ? "Owner assigned" : "Execution started",
    estimatedHours: input.estimatedHours,
    predictedSavingsHours: decision.predictedSavingsHours,
    createdAt: timestamp,
    updatedAt: timestamp,
  });
  await db.insert(auditEventsTable).values({
    id: `audit-${crypto.randomUUID()}`,
    taskId: id,
    action: "ROUTE_SELECTED",
    actor: "Orchestra routing engine",
    detail: `${decision.route.replace("_", " ")} selected at ${Math.round(decision.confidence * 100)}% confidence. ${decision.policyGate}.`,
    createdAt: timestamp,
  });

  return { taskId: id, decision, workspace: await getWorkspace() };
}

export async function recordEvaluation(task: Task) {
  const db = getDb();
  const quality = clamp(Math.round(96 - task.risk * 0.7 + task.verifiability * 0.55), 82, 98);
  const speed = clamp(Math.round(78 + task.predictedSavingsHours * 1.6), 76, 99);
  const efficiency = clamp(Math.round(75 + task.predictedSavingsHours * 2), 72, 99);
  const oversight = task.route === "AI_AGENT" ? (task.approvalRequired ? 90 : 98) : task.route === "HYBRID" ? 88 : 100;
  await db.insert(evaluationsTable).values({
    id: `eval-${crypto.randomUUID()}`,
    taskId: task.id,
    workerId: task.assigneeIds[0] ?? "unassigned",
    taskTitle: task.title,
    workerName: task.assignee,
    route: task.route,
    quality,
    speed,
    costEfficiency: efficiency,
    oversight,
    outcome: task.route === "HYBRID" ? "Approved with human oversight" : "Completed against success criteria",
    createdAt: Date.now(),
  });
}

export async function advanceTask(taskId: string) {
  await ensureDatabase();
  const db = getDb();
  const [row] = await db.select().from(tasksTable).where(eq(tasksTable.id, taskId)).limit(1);
  if (!row) throw new Error("Task not found");
  const task = normalizeTask(row);
  const timestamp = Date.now();
  let status = task.status;
  let progress = task.progress;
  let outcomeLabel = task.outcomeLabel;
  let action = "TASK_UPDATED";
  let detail = "Task state updated.";

  if (task.status === "ASSIGNED" || task.status === "NEEDS_REVISION") {
    status = "RUNNING";
    progress = task.status === "NEEDS_REVISION" ? 62 : 28;
    outcomeLabel = task.status === "NEEDS_REVISION" ? "Revision in progress" : "Execution started";
    action = "EXECUTION_STARTED";
    detail = `${task.assignee} started the assigned work.`;
  } else if (task.status === "RUNNING" && task.approvalRequired) {
    status = "WAITING_APPROVAL";
    progress = 88;
    outcomeLabel = "Approval requested";
    action = "APPROVAL_REQUESTED";
    detail = "Execution reached its governed human checkpoint.";
    const pending = await db.select().from(approvalsTable).where(and(eq(approvalsTable.taskId, task.id), eq(approvalsTable.status, "PENDING"))).limit(1);
    if (!pending.length) {
      await db.insert(approvalsTable).values({
        id: `approval-${crypto.randomUUID()}`,
        taskId: task.id,
        title: `Approve ${task.title}`,
        summary: `${task.assignee} completed the execution stage. Review the proposed output, routing evidence, and policy checks before release.`,
        requestedBy: task.assignee,
        riskLevel: task.risk >= 8 ? "HIGH" : task.risk >= 5 ? "MEDIUM" : "LOW",
        status: "PENDING",
        dueAt: timestamp + 86_400_000,
        createdAt: timestamp,
        decidedAt: null,
        note: "",
      });
    }
  } else if (task.status === "RUNNING") {
    status = "COMPLETED";
    progress = 100;
    outcomeLabel = "Success criteria met";
    action = "EXECUTION_COMPLETED";
    detail = "Output passed automated verification and was marked complete.";
    await recordEvaluation(task);
  }

  await db.update(tasksTable).set({ status, progress, outcomeLabel, updatedAt: timestamp }).where(eq(tasksTable.id, task.id));
  await db.insert(auditEventsTable).values({
    id: `audit-${crypto.randomUUID()}`,
    taskId: task.id,
    action,
    actor: "Orchestra workflow",
    detail,
    createdAt: timestamp,
  });
  return getWorkspace();
}

export async function decideApproval(approvalId: string, approved: boolean, note: string) {
  await ensureDatabase();
  const db = getDb();
  const [approvalRow] = await db.select().from(approvalsTable).where(eq(approvalsTable.id, approvalId)).limit(1);
  if (!approvalRow) throw new Error("Approval not found");
  const [taskRow] = await db.select().from(tasksTable).where(eq(tasksTable.id, approvalRow.taskId)).limit(1);
  if (!taskRow) throw new Error("Related task not found");
  const task = normalizeTask(taskRow);
  const timestamp = Date.now();
  const status = approved ? "APPROVED" : "REJECTED";

  await db.update(approvalsTable).set({ status, decidedAt: timestamp, note: note.trim() }).where(eq(approvalsTable.id, approvalId));
  await db.update(tasksTable).set({
    status: approved ? "COMPLETED" : "NEEDS_REVISION",
    progress: approved ? 100 : 58,
    outcomeLabel: approved ? "Approved and completed" : "Revision requested",
    updatedAt: timestamp,
  }).where(eq(tasksTable.id, task.id));

  if (approved) await recordEvaluation(task);
  await db.insert(auditEventsTable).values({
    id: `audit-${crypto.randomUUID()}`,
    taskId: task.id,
    action: approved ? "APPROVAL_GRANTED" : "REVISION_REQUESTED",
    actor: "Human reviewer",
    detail: note.trim() || (approved ? "Output approved at the required governance checkpoint." : "Output returned for revision."),
    createdAt: timestamp,
  });
  return getWorkspace();
}
