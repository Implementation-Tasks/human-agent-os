export type RouteMode = "HUMAN" | "AI_AGENT" | "HYBRID";
export type OrganizationRole = "ADMIN" | "MANAGER" | "REVIEWER" | "MEMBER";
export type Permission =
  | "TASK_VIEW"
  | "TASK_CREATE"
  | "TASK_RUN_AGENT"
  | "TASK_ADVANCE"
  | "TASK_APPROVE"
  | "POLICY_MANAGE"
  | "MEMBER_MANAGE";

export interface Worker {
  id: string;
  kind: "HUMAN" | "AI_AGENT";
  name: string;
  role: string;
  description: string;
  skills: string[];
  availability: number;
  costRate: number;
  reliability: number;
  status: string;
  initials: string;
  accent: string;
}

export interface Task {
  id: string;
  title: string;
  description: string;
  category: string;
  urgency: string;
  risk: number;
  sensitivity: number;
  judgment: number;
  verifiability: number;
  route: RouteMode;
  confidence: number;
  status: string;
  assignee: string;
  assigneeIds: string[];
  rationale: string[];
  approvalRequired: boolean;
  progress: number;
  outcomeLabel: string;
  estimatedHours: number;
  predictedSavingsHours: number;
  createdAt: number;
  updatedAt: number;
}

export interface Approval {
  id: string;
  taskId: string;
  title: string;
  summary: string;
  requestedBy: string;
  riskLevel: string;
  status: string;
  dueAt: number;
  createdAt: number;
  decidedAt: number | null;
  note: string;
}

export interface Evaluation {
  id: string;
  taskId: string;
  workerId: string;
  taskTitle: string;
  workerName: string;
  route: RouteMode;
  quality: number;
  speed: number;
  costEfficiency: number;
  oversight: number;
  outcome: string;
  createdAt: number;
}

export interface AuditEvent {
  id: string;
  taskId: string;
  action: string;
  actor: string;
  detail: string;
  createdAt: number;
}

export interface AccessContext {
  organizationId: string;
  organizationName: string;
  email: string;
  displayName: string;
  role: OrganizationRole;
  permissions: Permission[];
}

export interface OrganizationPolicy {
  id: string;
  organizationId: string;
  name: string;
  description: string;
  category: string;
  metric: string;
  operator: string;
  threshold: number;
  enforcement: string;
  active: boolean;
  createdAt: number;
  updatedAt: number;
}

export interface Membership {
  id: string;
  organizationId: string;
  email: string;
  displayName: string;
  role: OrganizationRole;
  status: string;
  createdAt: number;
  updatedAt: number;
}

export interface AgentRun {
  id: string;
  organizationId: string;
  taskId: string;
  agentId: string;
  requestedBy: string;
  modelId: string;
  status: string;
  prompt: string;
  output: string;
  error: string;
  inputTokens: number;
  outputTokens: number;
  latencyMs: number;
  createdAt: number;
  completedAt: number | null;
}

export interface AgentToolCall {
  id: string;
  agentRunId: string;
  toolName: string;
  input: string;
  output: string;
  status: string;
  durationMs: number;
  createdAt: number;
}

export interface BedrockConnection {
  configured: boolean;
  region: string;
  modelId: string;
  guardrailEnabled: boolean;
  guardrailId: string | null;
}

export interface WorkspaceSummary {
  activeTasks: number;
  aiSuccessRate: number;
  pendingApprovals: number;
  valueDelivered: number;
  hoursSaved: number;
  routeMix: { human: number; ai: number; hybrid: number };
}

export interface WorkspaceCore {
  workers: Worker[];
  tasks: Task[];
  approvals: Approval[];
  evaluations: Evaluation[];
  auditEvents: AuditEvent[];
  summary: WorkspaceSummary;
}

export interface WorkspaceData extends WorkspaceCore {
  access: AccessContext;
  policies: OrganizationPolicy[];
  memberships: Membership[];
  agentRuns: AgentRun[];
  toolCalls: AgentToolCall[];
  bedrock: BedrockConnection;
}

export interface CreateTaskInput {
  title: string;
  description: string;
  category: string;
  urgency: string;
  risk: number;
  sensitivity: number;
  judgment: number;
  verifiability: number;
  estimatedHours: number;
}

export interface RoutingDecision {
  route: RouteMode;
  confidence: number;
  assignee: string;
  rationale: string[];
  policyGate: string;
  predictedSavingsHours: number;
}
