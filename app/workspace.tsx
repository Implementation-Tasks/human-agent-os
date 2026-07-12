"use client";

import {
  Activity,
  AlertTriangle,
  ArrowUpRight,
  BarChart3,
  Bell,
  Bot,
  Check,
  CheckCircle2,
  ChevronRight,
  ClipboardList,
  Clock3,
  Cloud,
  DollarSign,
  FileText,
  GitBranch,
  KeyRound,
  LayoutDashboard,
  LockKeyhole,
  MoreHorizontal,
  Plus,
  Play,
  RefreshCw,
  Search,
  Settings,
  ShieldCheck,
  Sparkles,
  User,
  UserPlus,
  Users,
  Wrench,
  X,
  Zap,
} from "lucide-react";
import { FormEvent, useEffect, useMemo, useState } from "react";
import type {
  CreateTaskInput,
  OrganizationPolicy,
  OrganizationRole,
  RouteMode,
  RoutingDecision,
  Task,
  Worker,
  WorkspaceData,
} from "@/lib/types";

type View = "overview" | "tasks" | "workforce" | "approvals" | "evaluations" | "governance";

const now = Date.now();
const fallbackTasks: Task[] = [
  {
    id: "task-insights",
    title: "Q3 customer insight synthesis",
    description: "Synthesize 42 customer interviews into prioritized product opportunities.",
    category: "CUSTOMER_RESEARCH",
    urgency: "HIGH",
    risk: 5,
    sensitivity: 5,
    judgment: 7,
    verifiability: 8,
    route: "HYBRID",
    confidence: 0.89,
    status: "RUNNING",
    assignee: "Maya Chen + Research Agent",
    assigneeIds: ["human-maya", "agent-research"],
    rationale: ["AI accelerates evidence synthesis", "Human judgment is required to prioritize opportunities", "Sources can be verified against interview transcripts"],
    approvalRequired: true,
    progress: 82,
    outcomeLabel: "82% complete",
    estimatedHours: 18,
    predictedSavingsHours: 11,
    createdAt: now - 172_800_000,
    updatedAt: now - 1_800_000,
  },
  {
    id: "task-vendor",
    title: "Vendor risk review",
    description: "Review a proposed analytics vendor against security and procurement policy.",
    category: "RISK_REVIEW",
    urgency: "HIGH",
    risk: 7,
    sensitivity: 8,
    judgment: 7,
    verifiability: 7,
    route: "HYBRID",
    confidence: 0.94,
    status: "WAITING_APPROVAL",
    assignee: "Risk Review Agent → Ethan Park",
    assigneeIds: ["agent-risk", "human-ethan"],
    rationale: ["Sensitive vendor material requires human accountability", "Agent can screen evidence against policy", "High-risk findings require approval"],
    approvalRequired: true,
    progress: 91,
    outcomeLabel: "Approval requested",
    estimatedHours: 12,
    predictedSavingsHours: 7,
    createdAt: now - 86_400_000,
    updatedAt: now - 900_000,
  },
  {
    id: "task-renewal",
    title: "Renewal outreach",
    description: "Contact 15 at-risk customers with a personalized renewal plan.",
    category: "CUSTOMER_OUTREACH",
    urgency: "MEDIUM",
    risk: 6,
    sensitivity: 5,
    judgment: 8,
    verifiability: 5,
    route: "HUMAN",
    confidence: 0.86,
    status: "ASSIGNED",
    assignee: "Sophie Moore",
    assigneeIds: ["human-sophie"],
    rationale: ["Customer relationship context is central", "Commercial judgment is difficult to verify", "AI may assist drafting but not own the outreach"],
    approvalRequired: false,
    progress: 18,
    outcomeLabel: "3 / 15 contacted",
    estimatedHours: 10,
    predictedSavingsHours: 0,
    createdAt: now - 259_200_000,
    updatedAt: now - 7_200_000,
  },
  {
    id: "task-pricing",
    title: "Pricing model validation",
    description: "Reproduce the revised pricing model and review exceptions before launch.",
    category: "MODEL_VALIDATION",
    urgency: "HIGH",
    risk: 7,
    sensitivity: 6,
    judgment: 8,
    verifiability: 9,
    route: "HYBRID",
    confidence: 0.92,
    status: "RUNNING",
    assignee: "Noah Patel + Model Auditor",
    assigneeIds: ["human-noah", "agent-model"],
    rationale: ["Calculations are highly verifiable", "Material pricing decisions require accountable review", "Parallel AI verification reduces cycle time"],
    approvalRequired: true,
    progress: 71,
    outcomeLabel: "71% complete",
    estimatedHours: 16,
    predictedSavingsHours: 9,
    createdAt: now - 172_800_000,
    updatedAt: now - 3_600_000,
  },
];

const fallbackWorkspace: WorkspaceData = {
  workers: [],
  tasks: fallbackTasks,
  approvals: [],
  evaluations: [],
  auditEvents: [],
  access: {
    organizationId: "org-northwind",
    organizationName: "Northwind Operations",
    email: "jquan287619461@gmail.com",
    displayName: "Drewry Tran",
    role: "ADMIN",
    permissions: ["TASK_VIEW", "TASK_CREATE", "TASK_RUN_AGENT", "TASK_ADVANCE", "TASK_APPROVE", "POLICY_MANAGE", "MEMBER_MANAGE"],
  },
  policies: [],
  memberships: [],
  agentRuns: [],
  toolCalls: [],
  bedrock: {
    configured: false,
    region: "us-east-1",
    modelId: "amazon.nova-pro-v1:0",
    guardrailEnabled: false,
    guardrailId: null,
  },
  summary: {
    activeTasks: 24,
    aiSuccessRate: 93.4,
    pendingApprovals: 7,
    valueDelivered: 184_000,
    hoursSaved: 52,
    routeMix: { human: 8, ai: 12, hybrid: 4 },
  },
};

const initialForm: CreateTaskInput = {
  title: "",
  description: "",
  category: "CUSTOMER_RESEARCH",
  urgency: "MEDIUM",
  risk: 5,
  sensitivity: 4,
  judgment: 6,
  verifiability: 7,
  estimatedHours: 8,
};

const navItems: { id: View; label: string; icon: typeof LayoutDashboard }[] = [
  { id: "overview", label: "Overview", icon: LayoutDashboard },
  { id: "tasks", label: "Tasks", icon: ClipboardList },
  { id: "workforce", label: "Workforce", icon: Users },
  { id: "approvals", label: "Approvals", icon: ShieldCheck },
  { id: "evaluations", label: "Evaluations", icon: BarChart3 },
  { id: "governance", label: "Governance", icon: Settings },
];

function routeLabel(route: RouteMode) {
  if (route === "AI_AGENT") return "AI agent";
  if (route === "HYBRID") return "Hybrid";
  return "Human";
}

function statusLabel(status: string) {
  return status.toLowerCase().replaceAll("_", " ").replace(/^./, (letter) => letter.toUpperCase());
}

function money(value: number) {
  return new Intl.NumberFormat("en-US", { notation: "compact", style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(value);
}

function initials(name: string) {
  return name
    .split(/\s|\+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0])
    .join("");
}

export default function WorkforceApp() {
  const [workspace, setWorkspace] = useState<WorkspaceData>(fallbackWorkspace);
  const [view, setView] = useState<View>("overview");
  const [createOpen, setCreateOpen] = useState(false);
  const [selectedTask, setSelectedTask] = useState<Task | null>(null);
  const [decision, setDecision] = useState<RoutingDecision | null>(null);
  const [form, setForm] = useState<CreateTaskInput>(initialForm);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [synced, setSynced] = useState(false);
  const [actionBusy, setActionBusy] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/workspace", { cache: "no-store" })
      .then(async (response) => {
        if (!response.ok) throw new Error("Workspace data is temporarily unavailable.");
        return (await response.json()) as WorkspaceData;
      })
      .then((data) => {
        setWorkspace(data);
        setSynced(true);
      })
      .catch(() => setSynced(false));
  }, []);

  useEffect(() => {
    window.scrollTo({ top: 0, behavior: "smooth" });
  }, [view]);

  const taskMixTotal = Math.max(
    1,
    workspace.summary.routeMix.human + workspace.summary.routeMix.ai + workspace.summary.routeMix.hybrid,
  );
  const routePercent = useMemo(
    () => ({
      human: Math.round((workspace.summary.routeMix.human / taskMixTotal) * 100),
      ai: Math.round((workspace.summary.routeMix.ai / taskMixTotal) * 100),
      hybrid: Math.round((workspace.summary.routeMix.hybrid / taskMixTotal) * 100),
    }),
    [taskMixTotal, workspace.summary.routeMix],
  );

  function openCreateTask() {
    if (!workspace.access.permissions.includes("TASK_CREATE")) {
      setError(`Your ${workspace.access.role.toLowerCase()} role cannot create work.`);
      return;
    }
    setCreateOpen(true);
  }

  async function submitTask(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const response = await fetch("/api/tasks", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(form),
      });
      const payload = (await response.json()) as {
        error?: string;
        decision?: RoutingDecision;
        workspace?: WorkspaceData;
      };
      if (!response.ok || !payload.decision || !payload.workspace) {
        throw new Error(payload.error ?? "Unable to route this task.");
      }
      setWorkspace(payload.workspace);
      setDecision(payload.decision);
      setCreateOpen(false);
      setForm(initialForm);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Unable to route this task.");
    } finally {
      setBusy(false);
    }
  }

  async function runAction(body: Record<string, string>) {
    const key = body.taskId ?? body.approvalId ?? body.action;
    setActionBusy(key);
    setError(null);
    try {
      const response = await fetch("/api/actions", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });
      const payload = (await response.json()) as WorkspaceData & { error?: string };
      if (!response.ok) throw new Error(payload.error ?? "Unable to update this workflow.");
      setWorkspace(payload);
      if (body.taskId) {
        setSelectedTask(payload.tasks.find((task) => task.id === body.taskId) ?? null);
      }
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Unable to update this workflow.");
    } finally {
      setActionBusy(null);
    }
  }

  async function runBedrockAgent(taskId: string) {
    setActionBusy(taskId);
    setError(null);
    try {
      const response = await fetch("/api/agent-runs", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ taskId }),
      });
      const payload = (await response.json()) as { error?: string; output?: string; workspace?: WorkspaceData };
      if (!response.ok || !payload.workspace) throw new Error(payload.error ?? "Amazon Bedrock agent execution failed.");
      setWorkspace(payload.workspace);
      setSelectedTask(payload.workspace.tasks.find((task) => task.id === taskId) ?? null);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Amazon Bedrock agent execution failed.");
    } finally {
      setActionBusy(null);
    }
  }

  async function runGovernanceAction(body: Record<string, unknown>) {
    const key = String(body.policyId ?? body.membershipId ?? body.email ?? body.action);
    setActionBusy(key);
    setError(null);
    try {
      const response = await fetch("/api/governance", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });
      const payload = (await response.json()) as WorkspaceData & { error?: string };
      if (!response.ok) throw new Error(payload.error ?? "Unable to update organization governance.");
      setWorkspace(payload);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Unable to update organization governance.");
    } finally {
      setActionBusy(null);
    }
  }

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <button className="brand" onClick={() => setView("overview")} aria-label="Go to overview">
          <span className="brand-mark" aria-hidden="true"><span /></span>
          <span>Orchestra</span>
        </button>

        <nav className="primary-nav" aria-label="Primary navigation">
          {navItems.map((item) => {
            const Icon = item.icon;
            return (
              <button
                key={item.id}
                className={view === item.id ? "nav-item active" : "nav-item"}
                onClick={() => setView(item.id)}
              >
                <Icon size={20} strokeWidth={1.8} />
                <span>{item.label}</span>
                {item.id === "approvals" && workspace.summary.pendingApprovals > 0 ? (
                  <span className="nav-count">{workspace.summary.pendingApprovals}</span>
                ) : null}
                {view === item.id ? <span className="active-dot" /> : null}
              </button>
            );
          })}
        </nav>

        <div className="system-card">
          <div className="system-title"><span className={workspace.bedrock.configured ? "health-dot" : "health-dot warning"} />{workspace.bedrock.configured ? "Bedrock connected" : "Bedrock setup required"}</div>
          <p>{!synced ? "Connecting workspace…" : workspace.bedrock.configured ? workspace.bedrock.modelId : "Add protected AWS credentials"}</p>
          <ChevronRight size={18} />
        </div>
      </aside>

      <main className="main-area">
        <header className="topbar">
          <div>
            <p className="eyebrow">{workspace.access.organizationName}</p>
            <h1>Workforce Control Center</h1>
          </div>
          <div className="top-actions">
            <button className="search-button" aria-label="Search"><Search size={18} /> <span>Search</span><kbd>⌘ K</kbd></button>
            <div className="status-pill"><span className={workspace.bedrock.configured ? "health-dot" : "health-dot warning"} />{workspace.bedrock.configured ? "Bedrock online" : "Setup required"}</div>
            <button className="icon-button" aria-label="Notifications"><Bell size={20} /><span className="notification-dot" /></button>
            <span className={`role-pill ${workspace.access.role.toLowerCase()}`}>{workspace.access.role.toLowerCase()}</span>
            <button className="avatar-button" aria-label={`${workspace.access.displayName}, ${workspace.access.role}`}>{initials(workspace.access.displayName)}</button>
          </div>
        </header>

        {view === "overview" ? (
          <Overview
            workspace={workspace}
            routePercent={routePercent}
            onCreate={openCreateTask}
            onOpenTask={setSelectedTask}
            onNavigate={setView}
          />
        ) : view === "tasks" ? (
          <TasksView workspace={workspace} onCreate={openCreateTask} onOpenTask={setSelectedTask} />
        ) : view === "workforce" ? (
          <WorkforceView workspace={workspace} />
        ) : view === "approvals" ? (
          <ApprovalsView
            workspace={workspace}
            busyId={actionBusy}
            canApprove={workspace.access.permissions.includes("TASK_APPROVE")}
            onDecision={(approvalId, approved, note) => runAction({ action: approved ? "APPROVE" : "REJECT", approvalId, note })}
            onOpenTask={(taskId) => setSelectedTask(workspace.tasks.find((task) => task.id === taskId) ?? null)}
          />
        ) : view === "evaluations" ? (
          <EvaluationsView workspace={workspace} />
        ) : (
          <GovernanceView workspace={workspace} busyId={actionBusy} onAction={runGovernanceAction} />
        )}
      </main>

      <nav className="mobile-nav" aria-label="Mobile navigation">
        {navItems.map((item) => {
          const Icon = item.icon;
          return <button key={item.id} className={view === item.id ? "active" : ""} onClick={() => setView(item.id)}><Icon size={20} /><span>{item.label}</span></button>;
        })}
      </nav>

      {createOpen ? (
        <CreateTaskModal
          form={form}
          setForm={setForm}
          busy={busy}
          error={error}
          onClose={() => { setCreateOpen(false); setError(null); }}
          onSubmit={submitTask}
        />
      ) : null}
      {decision ? <DecisionDrawer decision={decision} onClose={() => setDecision(null)} onViewTasks={() => { setDecision(null); setView("tasks"); }} /> : null}
      {selectedTask ? (
        <TaskDrawer
          task={selectedTask}
          auditEvents={workspace.auditEvents.filter((event) => event.taskId === selectedTask.id)}
          agentRuns={workspace.agentRuns.filter((run) => run.taskId === selectedTask.id)}
          toolCalls={workspace.toolCalls}
          bedrockConfigured={workspace.bedrock.configured}
          canRunAgent={workspace.access.permissions.includes("TASK_RUN_AGENT")}
          busy={actionBusy === selectedTask.id}
          onAdvance={() => runAction({ action: "ADVANCE_TASK", taskId: selectedTask.id })}
          onRunAgent={() => runBedrockAgent(selectedTask.id)}
          onOpenGovernance={() => { setSelectedTask(null); setView("governance"); }}
          onClose={() => setSelectedTask(null)}
        />
      ) : null}
      {error && !createOpen ? <button className="error-toast" onClick={() => setError(null)}><AlertTriangle size={16} />{error}<X size={15} /></button> : null}
    </div>
  );
}

function Overview({
  workspace,
  routePercent,
  onCreate,
  onOpenTask,
  onNavigate,
}: {
  workspace: WorkspaceData;
  routePercent: { human: number; ai: number; hybrid: number };
  onCreate: () => void;
  onOpenTask: (task: Task) => void;
  onNavigate: (view: View) => void;
}) {
  const visibleTasks = workspace.tasks.slice(0, 4);
  return (
    <div className="page-content overview-page">
      <section className="hero-section">
        <div>
          <p className="section-kicker"><Sparkles size={14} /> Adaptive workforce orchestration</p>
          <h2>Put every task in the<br />right hands.</h2>
          <p className="hero-copy">Route work to humans, AI agents, or hybrid teams—<br className="desktop-break" />then measure what works.</p>
          <div className="hero-actions">
            <button className="split-cta" onClick={onCreate}><span>Create task</span><span><Plus size={22} /></span></button>
            <button className="text-button" onClick={() => onNavigate("workforce")}>View workforce <ChevronRight size={17} /></button>
          </div>
        </div>
        <div className="hero-signal" aria-label="Routing engine status">
          <div className="signal-orbit"><Zap size={24} /><i /><i /><i /></div>
          <div><strong>Routing engine ready</strong><span>4 policies · 8 workers · live evidence</span></div>
        </div>
      </section>

      <section className="metric-grid" aria-label="Workforce performance summary">
        <MetricCard label="Active tasks" value={String(workspace.summary.activeTasks)} trend="+8% this week" icon={<Activity size={20} />} chart="line" />
        <MetricCard label="AI success rate" value={`${workspace.summary.aiSuccessRate}%`} trend="1.8% improvement" icon={<Bot size={20} />} chart="ring" />
        <MetricCard label="Human review" value={String(workspace.summary.pendingApprovals)} trend={`${Math.min(3, workspace.summary.pendingApprovals)} due today`} icon={<ShieldCheck size={20} />} chart="bars" warning />
        <MetricCard label="Value delivered" value={money(workspace.summary.valueDelivered)} trend="This quarter" icon={<DollarSign size={20} />} chart="lineUp" />
      </section>

      <section className="operations-grid">
        <div className="panel routing-panel">
          <div className="panel-header">
            <div><span className="live-dot" /><h3>Live task routing</h3></div>
            <button onClick={() => onNavigate("tasks")}>View all tasks <ChevronRight size={16} /></button>
          </div>
          <div className="task-table" role="table" aria-label="Live task routing">
            <div className="task-row task-head" role="row">
              <span>Task</span><span>Route</span><span>Status</span><span>Owner</span><span>Outcome</span><span />
            </div>
            {visibleTasks.map((task) => (
              <button className="task-row" role="row" key={task.id} onClick={() => onOpenTask(task)}>
                <span className="task-name"><FileText size={16} />{task.title}</span>
                <span><RouteBadge route={task.route} /></span>
                <span><StatusBadge status={task.status} /></span>
                <span className="owner"><span className="mini-avatar">{initials(task.assignee)}</span>{task.assignee.split(" + ")[0].split(" → ").at(-1)}</span>
                <span className="outcome"><span>{task.outcomeLabel}</span><i style={{ width: `${task.progress}%` }} /></span>
                <span><MoreHorizontal size={17} /></span>
              </button>
            ))}
          </div>
        </div>

        <aside className="panel intelligence-panel">
          <div className="panel-header"><div><h3>Routing intelligence</h3></div><button aria-label="About routing intelligence"><AlertTriangle size={16} /></button></div>
          <p className="subtle-label">Workload split</p>
          <div className="mix-chart">
            <div className="donut" style={{ "--human": `${routePercent.human}%`, "--ai": `${routePercent.ai}%` } as React.CSSProperties}>
              <span><strong>{workspace.tasks.length}</strong>Total</span>
            </div>
            <div className="mix-legend">
              <div><span className="legend-swatch human" /><p>Human<small>{workspace.summary.routeMix.human} tasks</small></p><strong>{routePercent.human}%</strong></div>
              <div><span className="legend-swatch ai" /><p>AI agent<small>{workspace.summary.routeMix.ai} tasks</small></p><strong>{routePercent.ai}%</strong></div>
              <div><span className="legend-swatch hybrid" /><p>Hybrid<small>{workspace.summary.routeMix.hybrid} tasks</small></p><strong>{routePercent.hybrid}%</strong></div>
            </div>
          </div>
          <div className="divider" />
          <p className="subtle-label">Recommendation</p>
          <button className="recommendation" onClick={() => onNavigate("tasks")}>
            <span className="recommendation-icon"><Zap size={19} /></span>
            <span><strong>{workspace.summary.hoursSaved}h saved this month</strong><small>3 tasks are ready for more automation</small></span>
            <ChevronRight size={18} />
          </button>
          <button className="insights-link" onClick={() => onNavigate("evaluations")}>View insights <ArrowUpRight size={15} /></button>
        </aside>
      </section>
    </div>
  );
}

function MetricCard({ label, value, trend, icon, chart, warning = false }: { label: string; value: string; trend: string; icon: React.ReactNode; chart: string; warning?: boolean }) {
  return (
    <article className="metric-card">
      <div className="metric-label"><span>{icon}</span>{label}</div>
      <div className="metric-bottom"><div><strong>{value}</strong><small className={warning ? "warning" : "positive"}>{trend}</small></div><MiniChart type={chart} /></div>
    </article>
  );
}

function MiniChart({ type }: { type: string }) {
  if (type === "ring") return <div className="mini-ring"><span /></div>;
  if (type === "bars") return <div className="mini-bars">{[35, 64, 48, 74, 61, 86].map((height, index) => <i key={index} style={{ height: `${height}%` }} />)}</div>;
  const values = type === "lineUp" ? [22, 35, 31, 50, 46, 66, 61, 88] : [32, 42, 37, 55, 48, 64, 67, 86];
  return <div className="spark-bars">{values.map((height, index) => <i key={index} style={{ height: `${height}%` }} />)}</div>;
}

function RouteBadge({ route }: { route: RouteMode }) {
  const Icon = route === "HUMAN" ? User : route === "AI_AGENT" ? Bot : GitBranch;
  return <span className={`route-badge ${route.toLowerCase()}`}><Icon size={13} />{routeLabel(route)}</span>;
}

function StatusBadge({ status }: { status: string }) {
  const className = status === "WAITING_APPROVAL" ? "approval" : status === "COMPLETED" ? "complete" : status === "ASSIGNED" ? "assigned" : status === "NEEDS_REVISION" ? "revision" : "running";
  return <span className={`status-badge ${className}`}><i />{statusLabel(status)}</span>;
}

function CreateTaskModal({ form, setForm, busy, error, onClose, onSubmit }: {
  form: CreateTaskInput;
  setForm: React.Dispatch<React.SetStateAction<CreateTaskInput>>;
  busy: boolean;
  error: string | null;
  onClose: () => void;
  onSubmit: (event: FormEvent) => void;
}) {
  const update = <K extends keyof CreateTaskInput>(key: K, value: CreateTaskInput[K]) => setForm((current) => ({ ...current, [key]: value }));
  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <section className="modal task-modal" role="dialog" aria-modal="true" aria-labelledby="new-task-title">
        <div className="modal-header"><div><p className="section-kicker"><Sparkles size={14} /> New work request</p><h2 id="new-task-title">What needs to get done?</h2><p>Describe the outcome. Orchestra will assess and route the work.</p></div><button className="close-button" onClick={onClose} aria-label="Close"><X size={20} /></button></div>
        <form onSubmit={onSubmit}>
          <div className="form-grid">
            <label className="field full"><span>Task title</span><input autoFocus value={form.title} onChange={(event) => update("title", event.target.value)} placeholder="e.g. Review Q4 vendor risk" required /></label>
            <label className="field full"><span>Desired outcome</span><textarea value={form.description} onChange={(event) => update("description", event.target.value)} placeholder="Describe what a successful, usable result looks like…" rows={3} required /></label>
            <label className="field"><span>Work type</span><select value={form.category} onChange={(event) => update("category", event.target.value)}><option value="CUSTOMER_RESEARCH">Customer research</option><option value="MARKET_RESEARCH">Market research</option><option value="RISK_REVIEW">Risk review</option><option value="MODEL_VALIDATION">Model validation</option><option value="CUSTOMER_OUTREACH">Customer outreach</option><option value="GENERAL">General operations</option></select></label>
            <label className="field"><span>Urgency</span><select value={form.urgency} onChange={(event) => update("urgency", event.target.value)}><option>LOW</option><option>MEDIUM</option><option>HIGH</option><option>URGENT</option></select></label>
            <label className="field"><span>Estimated human hours</span><input type="number" min="1" max="200" value={form.estimatedHours} onChange={(event) => update("estimatedHours", Number(event.target.value))} /></label>
            <div className="assessment-note"><ShieldCheck size={18} /><span><strong>Policy-aware routing</strong>Hard constraints are applied before AI recommendations.</span></div>
          </div>
          <div className="score-grid">
            <ScoreField label="Business risk" value={form.risk} onChange={(value) => update("risk", value)} low="Low" high="Critical" />
            <ScoreField label="Data sensitivity" value={form.sensitivity} onChange={(value) => update("sensitivity", value)} low="Public" high="Restricted" />
            <ScoreField label="Judgment required" value={form.judgment} onChange={(value) => update("judgment", value)} low="Routine" high="Executive" />
            <ScoreField label="Verifiability" value={form.verifiability} onChange={(value) => update("verifiability", value)} low="Subjective" high="Objective" />
          </div>
          {error ? <p className="form-error"><AlertTriangle size={15} />{error}</p> : null}
          <div className="modal-actions"><button type="button" className="secondary-button" onClick={onClose}>Cancel</button><button className="primary-button" disabled={busy}>{busy ? "Assessing work…" : "Assess and route"}<ArrowUpRight size={17} /></button></div>
        </form>
      </section>
    </div>
  );
}

function ScoreField({ label, value, onChange, low, high }: { label: string; value: number; onChange: (value: number) => void; low: string; high: string }) {
  return <label className="score-field"><span><strong>{label}</strong><b>{value}/10</b></span><input type="range" min="1" max="10" value={value} onChange={(event) => onChange(Number(event.target.value))} /><small><span>{low}</span><span>{high}</span></small></label>;
}

function DecisionDrawer({ decision, onClose, onViewTasks }: { decision: RoutingDecision; onClose: () => void; onViewTasks: () => void }) {
  return (
    <div className="drawer-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <aside className="drawer decision-drawer" role="dialog" aria-modal="true" aria-labelledby="decision-title">
        <div className="drawer-top"><span className="decision-check"><Check size={22} /></span><button className="close-button" onClick={onClose} aria-label="Close"><X size={20} /></button></div>
        <p className="section-kicker">Routing decision</p>
        <h2 id="decision-title">The right team is ready.</h2>
        <p className="drawer-intro">Orchestra applied policy constraints, capability fit, and expected outcomes.</p>
        <div className="decision-route"><span><RouteBadge route={decision.route} /></span><strong>{Math.round(decision.confidence * 100)}% confidence</strong></div>
        <div className="decision-owner"><span className="large-avatar">{initials(decision.assignee)}</span><div><small>Recommended owner</small><strong>{decision.assignee}</strong></div></div>
        <div className="policy-strip"><ShieldCheck size={19} /><div><small>Governance result</small><strong>{decision.policyGate}</strong></div></div>
        <div className="rationale-list"><p>Why this route</p>{decision.rationale.map((reason) => <div key={reason}><CheckCircle2 size={17} /><span>{reason}</span></div>)}</div>
        <div className="decision-impact"><Clock3 size={20} /><div><small>Predicted capacity returned</small><strong>{decision.predictedSavingsHours || "0"} hours</strong></div></div>
        <div className="drawer-actions"><button className="primary-button" onClick={onViewTasks}>Open task workspace <ArrowUpRight size={17} /></button><button className="secondary-button" onClick={onClose}>Done</button></div>
      </aside>
    </div>
  );
}

function TaskDrawer({ task, auditEvents, agentRuns, toolCalls, bedrockConfigured, canRunAgent, busy, onAdvance, onRunAgent, onOpenGovernance, onClose }: {
  task: Task;
  auditEvents: WorkspaceData["auditEvents"];
  agentRuns: WorkspaceData["agentRuns"];
  toolCalls: WorkspaceData["toolCalls"];
  bedrockConfigured: boolean;
  canRunAgent: boolean;
  busy: boolean;
  onAdvance: () => void;
  onRunAgent: () => void;
  onOpenGovernance: () => void;
  onClose: () => void;
}) {
  const latestRun = agentRuns[0];
  const isAgentTask = task.route !== "HUMAN";
  const agentReady = ["ASSIGNED", "RUNNING", "NEEDS_REVISION"].includes(task.status);
  const actionLabel = !isAgentTask && (task.status === "ASSIGNED" ? "Start work" : task.status === "NEEDS_REVISION" ? "Start revision" : task.status === "RUNNING" ? (task.approvalRequired ? "Send for approval" : "Complete execution") : null);
  const runTools = latestRun ? toolCalls.filter((tool) => tool.agentRunId === latestRun.id) : [];
  return (
    <div className="drawer-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <aside className="drawer" role="dialog" aria-modal="true" aria-labelledby="task-title">
        <div className="drawer-top"><RouteBadge route={task.route} /><button className="close-button" onClick={onClose} aria-label="Close"><X size={20} /></button></div>
        <p className="section-kicker">Task · {task.id.replace("task-", "")}</p>
        <h2 id="task-title">{task.title}</h2>
        <p className="drawer-intro">{task.description}</p>
        <div className="task-state-card"><div><StatusBadge status={task.status} /><strong>{task.outcomeLabel}</strong></div><span>{task.progress}%</span><i><b style={{ width: `${task.progress}%` }} /></i></div>
        <div className="detail-grid"><div><small>Owner</small><strong>{task.assignee}</strong></div><div><small>Confidence</small><strong>{Math.round(task.confidence * 100)}%</strong></div><div><small>Risk</small><strong>{task.risk}/10</strong></div><div><small>Expected savings</small><strong>{task.predictedSavingsHours}h</strong></div></div>
        <div className="rationale-list"><p>Routing evidence</p>{task.rationale.map((reason) => <div key={reason}><CheckCircle2 size={17} /><span>{reason}</span></div>)}</div>
        <div className="policy-strip"><ShieldCheck size={19} /><div><small>Human oversight</small><strong>{task.approvalRequired ? "Required before completion" : "Policy checks satisfied"}</strong></div></div>
        {latestRun?.status === "COMPLETED" ? (
          <section className="agent-result">
            <div className="agent-result-head"><span><Cloud size={18} /><strong>Amazon Bedrock output</strong></span><span>{latestRun.modelId}</span></div>
            <p>{latestRun.output}</p>
            <div className="agent-run-metrics"><span><small>Tokens</small><strong>{latestRun.inputTokens + latestRun.outputTokens}</strong></span><span><small>Latency</small><strong>{(latestRun.latencyMs / 1000).toFixed(1)}s</strong></span><span><small>Tools</small><strong>{runTools.length}</strong></span></div>
            {runTools.length ? <div className="tool-trace"><p>Approved tool trace</p>{runTools.map((tool) => <div key={tool.id}><Wrench size={14} /><span><strong>{tool.toolName.replaceAll("_", " ")}</strong><small>{tool.status.toLowerCase()} · {tool.durationMs}ms</small></span></div>)}</div> : null}
          </section>
        ) : null}
        {latestRun?.status === "FAILED" ? <div className="agent-error"><AlertTriangle size={17} /><span><strong>Bedrock run failed</strong><small>{latestRun.error}</small></span></div> : null}
        <div className="audit-list">
          <p>Execution history</p>
          {auditEvents.length ? auditEvents.slice(0, 5).map((event) => (
            <div key={event.id}><i /><span><strong>{event.action.toLowerCase().replaceAll("_", " ")}</strong><small>{event.detail}</small><time>{relativeTime(event.createdAt)} · {event.actor}</time></span></div>
          )) : <div className="empty-inline">No workflow events yet.</div>}
        </div>
        {isAgentTask && agentReady && bedrockConfigured && canRunAgent ? <button className="primary-button drawer-primary bedrock-run" disabled={busy} onClick={onRunAgent}>{busy ? <><RefreshCw className="spin" size={17} />Bedrock agent is working…</> : <><Play size={17} />Run assigned Bedrock agent</>}</button> : null}
        {isAgentTask && agentReady && !bedrockConfigured ? <button className="secondary-button drawer-primary setup-bedrock" onClick={onOpenGovernance}><KeyRound size={17} />Configure Amazon Bedrock</button> : null}
        {isAgentTask && agentReady && bedrockConfigured && !canRunAgent ? <div className="waiting-note"><LockKeyhole size={17} />Your role can view this task but cannot start agent execution.</div> : null}
        {actionLabel ? <button className="primary-button drawer-primary" disabled={busy} onClick={onAdvance}>{busy ? "Updating workflow…" : actionLabel}<ArrowUpRight size={17} /></button> : null}
        {task.status === "WAITING_APPROVAL" ? <div className="waiting-note"><Clock3 size={17} />This task is paused until an authorized reviewer decides.</div> : null}
      </aside>
    </div>
  );
}

function TasksView({ workspace, onCreate, onOpenTask }: { workspace: WorkspaceData; onCreate: () => void; onOpenTask: (task: Task) => void }) {
  const [filter, setFilter] = useState("ALL");
  const [query, setQuery] = useState("");
  const filtered = workspace.tasks.filter((task) => {
    const matchesFilter = filter === "ALL" || (filter === "ACTIVE" && !["COMPLETED", "WAITING_APPROVAL"].includes(task.status)) || (filter === "REVIEW" && task.status === "WAITING_APPROVAL") || (filter === "COMPLETE" && task.status === "COMPLETED");
    return matchesFilter && `${task.title} ${task.description} ${task.assignee}`.toLowerCase().includes(query.toLowerCase());
  });
  return (
    <div className="page-content inner-page">
      <PageHeading kicker="Work orchestration" title="Every unit of work, governed." copy="Inspect routing evidence, move work forward, and intervene at the right moment." action={<button className="split-cta" onClick={onCreate}><span>Create task</span><span><Plus size={21} /></span></button>} />
      <section className="task-control-panel panel">
        <div className="filterbar">
          <div className="filter-tabs">{[["ALL", "All work"], ["ACTIVE", "Active"], ["REVIEW", "Awaiting review"], ["COMPLETE", "Complete"]].map(([id, label]) => <button key={id} className={filter === id ? "active" : ""} onClick={() => setFilter(id)}>{label}{id === "REVIEW" && workspace.summary.pendingApprovals ? <span>{workspace.summary.pendingApprovals}</span> : null}</button>)}</div>
          <label className="inline-search"><Search size={16} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search work" /></label>
        </div>
        <div className="work-table">
          <div className="work-row work-head"><span>Work</span><span>Recommended route</span><span>Owner</span><span>Governance</span><span>Progress</span><span /></div>
          {filtered.map((task) => (
            <button key={task.id} className="work-row" onClick={() => onOpenTask(task)}>
              <span className="work-title"><i className={`priority-dot ${task.urgency.toLowerCase()}`} /><span><strong>{task.title}</strong><small>{task.description}</small></span></span>
              <span><RouteBadge route={task.route} /><small className="confidence">{Math.round(task.confidence * 100)}% confidence</small></span>
              <span className="work-owner"><span className="mini-avatar">{initials(task.assignee)}</span><span><strong>{task.assignee}</strong><small>{task.route === "AI_AGENT" ? "Approved agent" : task.route === "HYBRID" ? "Mixed team" : "Accountable human"}</small></span></span>
              <span><StatusBadge status={task.status} /><small className="governance-copy">{task.approvalRequired ? "Approval gate enabled" : "Policy checks passed"}</small></span>
              <span className="table-progress"><strong>{task.progress}%</strong><i><b style={{ width: `${task.progress}%` }} /></i><small>{task.outcomeLabel}</small></span>
              <span><ChevronRight size={18} /></span>
            </button>
          ))}
          {!filtered.length ? <EmptyState icon={<Search size={22} />} title="No matching work" copy="Try a different status or search term." /> : null}
        </div>
      </section>
    </div>
  );
}

function WorkforceView({ workspace }: { workspace: WorkspaceData }) {
  const [kind, setKind] = useState<"ALL" | "HUMAN" | "AI_AGENT">("ALL");
  const [selectedWorker, setSelectedWorker] = useState<Worker | null>(null);
  const visible = workspace.workers.filter((worker) => kind === "ALL" || worker.kind === kind);
  const humans = workspace.workers.filter((worker) => worker.kind === "HUMAN");
  const agents = workspace.workers.filter((worker) => worker.kind === "AI_AGENT");
  const reliability = workspace.workers.length ? Math.round(workspace.workers.reduce((sum, worker) => sum + worker.reliability, 0) / workspace.workers.length) : 0;
  return (
    <div className="page-content inner-page">
      <PageHeading kicker="Capability registry" title="One workforce. Different strengths." copy="Compare availability, capabilities, cost, and observed reliability across people and approved agents." />
      <section className="compact-metrics">
        <CompactMetric label="Human capacity" value={`${Math.round(humans.reduce((sum, worker) => sum + worker.availability, 0) / Math.max(1, humans.length))}%`} detail={`${humans.length} accountable workers`} icon={<Users size={19} />} />
        <CompactMetric label="Agent availability" value={`${agents.filter((agent) => agent.status === "ONLINE").length}/${agents.length}`} detail="Approved and online" icon={<Bot size={19} />} />
        <CompactMetric label="Observed reliability" value={`${reliability}%`} detail="Across completed work" icon={<ShieldCheck size={19} />} />
        <CompactMetric label="Capability coverage" value="94%" detail="Of recurring work types" icon={<Sparkles size={19} />} />
      </section>
      <section className="registry-section">
        <div className="section-toolbar"><div><h3>Available capability</h3><p>Performance is based on verified outcomes, not self-reported claims.</p></div><div className="segmented-control"><button className={kind === "ALL" ? "active" : ""} onClick={() => setKind("ALL")}>All</button><button className={kind === "HUMAN" ? "active" : ""} onClick={() => setKind("HUMAN")}>Humans</button><button className={kind === "AI_AGENT" ? "active" : ""} onClick={() => setKind("AI_AGENT")}>AI agents</button></div></div>
        <div className="worker-grid">
          {visible.map((worker) => (
            <article className="worker-card" key={worker.id}>
              <div className="worker-top"><span className={`worker-avatar ${worker.accent}`}>{worker.kind === "AI_AGENT" ? <Bot size={20} /> : worker.initials}</span><span className={`worker-status ${worker.status.toLowerCase()}`}><i />{worker.status.toLowerCase()}</span></div>
              <div className="worker-name"><h3>{worker.name}</h3><RouteBadge route={worker.kind === "HUMAN" ? "HUMAN" : "AI_AGENT"} /></div>
              <p className="worker-role">{worker.role}</p><p className="worker-description">{worker.description}</p>
              <div className="skill-list">{worker.skills.slice(0, 3).map((skill) => <span key={skill}>{skill}</span>)}</div>
              <div className="worker-stats"><div><small>Availability</small><strong>{worker.availability}%</strong><i><b style={{ width: `${worker.availability}%` }} /></i></div><div><small>Reliability</small><strong>{worker.reliability}%</strong><i><b style={{ width: `${worker.reliability}%` }} /></i></div></div>
              <div className="worker-footer"><span>{worker.kind === "HUMAN" ? `$${worker.costRate}/hr` : `$${worker.costRate}/run`}</span><button onClick={() => setSelectedWorker(worker)}>View evidence <ArrowUpRight size={14} /></button></div>
            </article>
          ))}
        </div>
      </section>
      {selectedWorker ? <WorkerDrawer worker={selectedWorker} evaluations={workspace.evaluations.filter((evaluation) => evaluation.workerId === selectedWorker.id || evaluation.workerName.includes(selectedWorker.name))} onClose={() => setSelectedWorker(null)} /> : null}
    </div>
  );
}

function WorkerDrawer({ worker, evaluations, onClose }: { worker: Worker; evaluations: WorkspaceData["evaluations"]; onClose: () => void }) {
  const outcomes = evaluations.length;
  const averageQuality = outcomes ? Math.round(evaluations.reduce((sum, evaluation) => sum + evaluation.quality, 0) / outcomes) : worker.reliability;
  return (
    <div className="drawer-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <aside className="drawer worker-drawer" role="dialog" aria-modal="true" aria-labelledby="worker-title">
        <div className="drawer-top"><span className={`worker-avatar ${worker.accent}`}>{worker.kind === "AI_AGENT" ? <Bot size={21} /> : worker.initials}</span><button className="close-button" onClick={onClose} aria-label="Close"><X size={20} /></button></div>
        <p className="section-kicker">Verified capability profile</p><h2 id="worker-title">{worker.name}</h2><p className="drawer-intro">{worker.description}</p>
        <div className="worker-drawer-meta"><RouteBadge route={worker.kind === "HUMAN" ? "HUMAN" : "AI_AGENT"} /><span className={`worker-status ${worker.status.toLowerCase()}`}><i />{worker.status.toLowerCase()}</span></div>
        <div className="detail-grid"><div><small>Reliability</small><strong>{worker.reliability}%</strong></div><div><small>Availability</small><strong>{worker.availability}%</strong></div><div><small>Verified quality</small><strong>{averageQuality}/100</strong></div><div><small>Operating cost</small><strong>${worker.costRate}/{worker.kind === "HUMAN" ? "hr" : "run"}</strong></div></div>
        <div className="capability-evidence"><p>Capability evidence</p>{worker.skills.map((skill, index) => <div key={skill}><span>{index + 1}</span><div><strong>{skill}</strong><small>{index < 2 ? "Demonstrated in verified outcomes" : "Declared and policy-approved capability"}</small></div><CheckCircle2 size={16} /></div>)}</div>
        <div className="rationale-list"><p>Recent outcomes</p>{evaluations.length ? evaluations.slice(0, 4).map((evaluation) => <div key={evaluation.id}><CheckCircle2 size={17} /><span><strong>{evaluation.taskTitle}</strong><small>{evaluation.quality}/100 quality · {evaluation.outcome}</small></span></div>) : <div className="empty-inline">No completed evaluation is linked yet. Reliability reflects registry validation.</div>}</div>
      </aside>
    </div>
  );
}

function ApprovalsView({ workspace, busyId, canApprove, onDecision, onOpenTask }: { workspace: WorkspaceData; busyId: string | null; canApprove: boolean; onDecision: (approvalId: string, approved: boolean, note: string) => void; onOpenTask: (taskId: string) => void }) {
  const [notes, setNotes] = useState<Record<string, string>>({});
  const pending = workspace.approvals.filter((approval) => approval.status === "PENDING");
  const decided = workspace.approvals.filter((approval) => approval.status !== "PENDING");
  return (
    <div className="page-content inner-page">
      <PageHeading kicker="Human oversight" title="Judgment, exactly where it matters." copy="Review material decisions with the routing evidence, policy result, and execution context in one place." />
      <div className="approval-summary"><span className="approval-summary-icon"><ShieldCheck size={24} /></span><div><strong>{pending.length} decision{pending.length === 1 ? "" : "s"} awaiting review</strong><p>Every execution is paused safely until an authorized reviewer responds.</p></div><span className="sla-pill"><Clock3 size={14} /> Median response 1.8h</span></div>
      <section className="approval-list">
        {pending.map((approval) => {
          const task = workspace.tasks.find((item) => item.id === approval.taskId);
          return (
            <article className="approval-card" key={approval.id}>
              <div className="approval-card-head"><div><span className={`risk-tag ${approval.riskLevel.toLowerCase()}`}>{approval.riskLevel} risk</span><span>Due {relativeTime(approval.dueAt)}</span></div><button onClick={() => onOpenTask(approval.taskId)}>Open task <ArrowUpRight size={15} /></button></div>
              <div className="approval-body"><div className="approval-copy"><p className="section-kicker">{task ? routeLabel(task.route) : "Governed work"}</p><h3>{approval.title}</h3><p>{approval.summary}</p><div className="requested-by"><span className="mini-avatar">{initials(approval.requestedBy)}</span><span><small>Requested by</small><strong>{approval.requestedBy}</strong></span></div></div>
                <div className="approval-evidence"><div><small>Policy result</small><strong><CheckCircle2 size={16} />Checkpoint triggered correctly</strong></div><div><small>Route confidence</small><strong>{task ? Math.round(task.confidence * 100) : 90}%</strong></div><div><small>Business risk</small><strong>{task?.risk ?? 6}/10</strong></div><div><small>Data sensitivity</small><strong>{task?.sensitivity ?? 6}/10</strong></div></div>
              </div>
              <label className="review-note"><span>Review note <small>optional</small></span><textarea value={notes[approval.id] ?? ""} onChange={(event) => setNotes((current) => ({ ...current, [approval.id]: event.target.value }))} placeholder="Capture the reasoning behind this decision…" rows={2} /></label>
              <div className="approval-actions">{!canApprove ? <span className="permission-note"><LockKeyhole size={14} />Reviewer or admin role required</span> : null}<button className="reject-button" disabled={busyId === approval.id || !canApprove} onClick={() => onDecision(approval.id, false, notes[approval.id] ?? "")}>Request revision</button><button className="approve-button" disabled={busyId === approval.id || !canApprove} onClick={() => onDecision(approval.id, true, notes[approval.id] ?? "")}><Check size={16} />{busyId === approval.id ? "Recording decision…" : "Approve output"}</button></div>
            </article>
          );
        })}
        {!pending.length ? <EmptyState icon={<CheckCircle2 size={24} />} title="Approval queue is clear" copy="New governed checkpoints will appear here automatically." /> : null}
      </section>
      {decided.length ? <section className="recent-decisions"><div className="section-toolbar"><div><h3>Recent decisions</h3><p>An accountable record of human interventions.</p></div></div>{decided.slice(0, 5).map((approval) => <div className="decision-row" key={approval.id}><span className={`decision-symbol ${approval.status.toLowerCase()}`}>{approval.status === "APPROVED" ? <Check size={15} /> : <X size={15} />}</span><span><strong>{approval.title}</strong><small>{approval.note || "Decision recorded without an additional note."}</small></span><StatusBadge status={approval.status === "APPROVED" ? "COMPLETED" : "NEEDS_REVISION"} /><time>{approval.decidedAt ? relativeTime(approval.decidedAt) : "Recently"}</time></div>)}</section> : null}
    </div>
  );
}

function EvaluationsView({ workspace }: { workspace: WorkspaceData }) {
  const routeScores = (["HUMAN", "AI_AGENT", "HYBRID"] as RouteMode[]).map((route) => {
    const rows = workspace.evaluations.filter((evaluation) => evaluation.route === route);
    const average = (key: "quality" | "speed" | "costEfficiency" | "oversight") => rows.length ? Math.round(rows.reduce((sum, row) => sum + row[key], 0) / rows.length) : 0;
    return { route, count: rows.length, quality: average("quality"), speed: average("speed"), efficiency: average("costEfficiency"), oversight: average("oversight") };
  });
  return (
    <div className="page-content inner-page">
      <PageHeading kicker="Outcome intelligence" title="Measure the work, not the worker type." copy="Compare quality, speed, cost efficiency, and oversight using one outcome framework." />
      <section className="scorecard-grid">
        {routeScores.map((score) => <article className={`route-scorecard ${score.route.toLowerCase()}`} key={score.route}><div><RouteBadge route={score.route} /><span>{score.count} evaluated</span></div><strong>{score.quality || "—"}<small>{score.quality ? "/100" : ""}</small></strong><p>Average verified quality</p><div className="score-metrics"><span><small>Speed</small><b>{score.speed || "—"}</b></span><span><small>Cost efficiency</small><b>{score.efficiency || "—"}</b></span><span><small>Oversight</small><b>{score.oversight || "—"}</b></span></div></article>)}
        <article className="optimization-card"><span><Zap size={22} /></span><p className="section-kicker">Optimization signal</p><h3>Hybrid teams lead on complex, verifiable work.</h3><p>Keep human accountability, but shift first-pass analysis to approved agents.</p><button>Review 3 opportunities <ArrowUpRight size={15} /></button></article>
      </section>
      <section className="evaluation-panel panel"><div className="panel-header"><div><h3>Verified outcomes</h3></div><span className="method-pill"><ShieldCheck size={13} /> Rubric-based evaluation</span></div><div className="evaluation-table"><div className="evaluation-row evaluation-head"><span>Work</span><span>Workforce</span><span>Quality</span><span>Speed</span><span>Efficiency</span><span>Outcome</span></div>{workspace.evaluations.map((evaluation) => <div className="evaluation-row" key={evaluation.id}><span><strong>{evaluation.taskTitle}</strong><small>{new Date(evaluation.createdAt).toLocaleDateString("en-US", { month: "short", day: "numeric" })}</small></span><span><RouteBadge route={evaluation.route} /><small>{evaluation.workerName}</small></span><Score value={evaluation.quality} /><Score value={evaluation.speed} /><Score value={evaluation.costEfficiency} /><span className="evaluation-outcome"><CheckCircle2 size={15} />{evaluation.outcome}</span></div>)}</div></section>
      <section className="audit-panel"><div className="section-toolbar"><div><h3>Governance audit trail</h3><p>Immutable decisions and execution events across the workspace.</p></div><span className="audit-count">{workspace.auditEvents.length} events</span></div><div className="audit-table">{workspace.auditEvents.slice(0, 8).map((event) => { const task = workspace.tasks.find((item) => item.id === event.taskId); return <div className="audit-row" key={event.id}><span className="audit-symbol"><Activity size={15} /></span><span><strong>{event.action.toLowerCase().replaceAll("_", " ")}</strong><small>{event.detail}</small></span><span><strong>{task?.title ?? event.taskId}</strong><small>{event.actor}</small></span><time>{relativeTime(event.createdAt)}</time></div>; })}</div></section>
    </div>
  );
}

function GovernanceView({ workspace, busyId, onAction }: { workspace: WorkspaceData; busyId: string | null; onAction: (body: Record<string, unknown>) => Promise<void> }) {
  const [section, setSection] = useState<"BEDROCK" | "POLICIES" | "ACCESS">("BEDROCK");
  const canManagePolicies = workspace.access.permissions.includes("POLICY_MANAGE");
  const canManageMembers = workspace.access.permissions.includes("MEMBER_MANAGE");
  const completedRuns = workspace.agentRuns.filter((run) => run.status === "COMPLETED");
  return (
    <div className="page-content inner-page governance-page">
      <PageHeading kicker="Enterprise control plane" title="Trust is part of the architecture." copy="Manage Bedrock execution, organization policies, identity, roles, and the evidence behind every agent action." />
      <div className="governance-tabs" role="tablist" aria-label="Governance sections">
        <button className={section === "BEDROCK" ? "active" : ""} onClick={() => setSection("BEDROCK")}><Cloud size={16} />Bedrock runtime</button>
        <button className={section === "POLICIES" ? "active" : ""} onClick={() => setSection("POLICIES")}><ShieldCheck size={16} />Organization policies</button>
        <button className={section === "ACCESS" ? "active" : ""} onClick={() => setSection("ACCESS")}><KeyRound size={16} />Identity & RBAC</button>
      </div>

      {section === "BEDROCK" ? (
        <section className="governance-stack">
          <div className={`bedrock-connection ${workspace.bedrock.configured ? "connected" : "needs-setup"}`}>
            <span className="bedrock-icon"><Cloud size={27} /></span>
            <div><p className="section-kicker">Amazon Bedrock</p><h3>{workspace.bedrock.configured ? "Agent runtime connected" : "Credentials required for live execution"}</h3><p>{workspace.bedrock.configured ? "Orchestra can now invoke approved models, execute organization tools, and persist a complete run trace." : "The integration code is active. Add a least-privilege IAM access key as protected runtime secrets to enable real agent runs."}</p></div>
            <span className={`connection-state ${workspace.bedrock.configured ? "online" : "offline"}`}><i />{workspace.bedrock.configured ? "Connected" : "Not configured"}</span>
          </div>

          <div className="runtime-grid">
            <article className="governance-card runtime-details"><div className="governance-card-head"><span><Settings size={18} /><strong>Runtime configuration</strong></span></div><dl><div><dt>AWS Region</dt><dd>{workspace.bedrock.region}</dd></div><div><dt>Model ID</dt><dd>{workspace.bedrock.modelId}</dd></div><div><dt>API</dt><dd>Bedrock Converse</dd></div><div><dt>Tool mode</dt><dd>Organization allowlist</dd></div><div><dt>Guardrail</dt><dd>{workspace.bedrock.guardrailEnabled ? `Enabled · ${workspace.bedrock.guardrailId}` : "Optional · not configured"}</dd></div></dl></article>
            <article className="governance-card secret-checklist"><div className="governance-card-head"><span><KeyRound size={18} /><strong>Protected runtime secrets</strong></span></div><p>These values stay outside the database and are never returned to the browser.</p><div><code>AWS_ACCESS_KEY_ID</code><StatusDot ready={workspace.bedrock.configured} /></div><div><code>AWS_SECRET_ACCESS_KEY</code><StatusDot ready={workspace.bedrock.configured} /></div><div><code>AWS_REGION</code><StatusDot ready /></div><div><code>BEDROCK_MODEL_ID</code><StatusDot ready /></div><div><code>BEDROCK_GUARDRAIL_ID</code><span className="optional-tag">optional</span></div><div><code>BEDROCK_GUARDRAIL_VERSION</code><span className="optional-tag">optional</span></div></article>
          </div>

          <article className="governance-card iam-card"><div className="governance-card-head"><span><LockKeyhole size={18} /><strong>Least-privilege IAM policy</strong></span><span className="method-pill">One model · one action</span></div><p>Attach only the permission required by the Converse API. Replace the region and model ID if you change the runtime configuration.</p><pre>{`{
  "Version": "2012-10-17",
  "Statement": [{
    "Effect": "Allow",
    "Action": "bedrock:InvokeModel",
    "Resource": "arn:aws:bedrock:${workspace.bedrock.region}::foundation-model/${workspace.bedrock.modelId}"
  }]
}`}</pre></article>

          <article className="governance-card recent-runs"><div className="governance-card-head"><span><Activity size={18} /><strong>Agent execution evidence</strong></span><span>{workspace.agentRuns.length} runs</span></div>{workspace.agentRuns.length ? workspace.agentRuns.slice(0, 8).map((run) => <div className="run-row" key={run.id}><span className={`run-state ${run.status.toLowerCase()}`}><Bot size={15} /></span><span><strong>{workspace.tasks.find((task) => task.id === run.taskId)?.title ?? run.taskId}</strong><small>{run.modelId} · requested by {run.requestedBy}</small></span><StatusBadge status={run.status === "FAILED" ? "NEEDS_REVISION" : run.status} /><span className="run-metrics">{run.status === "COMPLETED" ? `${run.inputTokens + run.outputTokens} tokens · ${(run.latencyMs / 1000).toFixed(1)}s` : run.error || "Running"}</span></div>) : <EmptyState icon={<Play size={22} />} title="No Bedrock runs yet" copy="Open an AI or hybrid task and start its assigned agent." />}</article>
          {completedRuns.length ? <p className="governance-footnote"><CheckCircle2 size={14} />All completed agent runs retain model, token, latency, tool, requester, and policy evidence.</p> : null}
        </section>
      ) : null}

      {section === "POLICIES" ? (
        <section className="governance-stack">
          <div className="policy-summary"><span><ShieldCheck size={23} /></span><div><strong>{workspace.policies.filter((policy) => policy.active).length} active organization policies</strong><p>Active rules feed both deterministic routing and the Bedrock agent system prompt.</p></div><span className="role-access">{canManagePolicies ? "Admin controls enabled" : "Read-only access"}</span></div>
          <div className="policy-list">{workspace.policies.map((policy) => <PolicyControl key={policy.id} policy={policy} canManage={canManagePolicies} busy={busyId === policy.id} onAction={onAction} />)}</div>
        </section>
      ) : null}

      {section === "ACCESS" ? (
        <AccessManagement workspace={workspace} canManage={canManageMembers} busyId={busyId} onAction={onAction} />
      ) : null}
    </div>
  );
}

function PolicyControl({ policy, canManage, busy, onAction }: { policy: OrganizationPolicy; canManage: boolean; busy: boolean; onAction: (body: Record<string, unknown>) => Promise<void> }) {
  const [threshold, setThreshold] = useState(policy.threshold);
  return <article className={`policy-card ${policy.active ? "active" : "inactive"}`}><div className="policy-status-icon"><ShieldCheck size={18} /></div><div className="policy-copy"><div><span className={`policy-category ${policy.category.toLowerCase()}`}>{policy.category}</span><span className="enforcement-tag">{policy.enforcement.toLowerCase().replaceAll("_", " ")}</span></div><h3>{policy.name}</h3><p>{policy.description}</p><code>{policy.metric} {policy.operator} {policy.threshold}</code></div><div className="policy-controls"><label><span>Threshold</span><input type="number" min="1" max="10" value={threshold} disabled={!canManage || busy} onChange={(event) => setThreshold(Number(event.target.value))} /></label><button className="secondary-button" disabled={!canManage || busy || threshold === policy.threshold} onClick={() => onAction({ action: "UPDATE_POLICY", policyId: policy.id, threshold })}>{busy ? "Saving…" : "Save"}</button><label className="switch"><input type="checkbox" checked={policy.active} disabled={!canManage || busy} onChange={(event) => onAction({ action: "UPDATE_POLICY", policyId: policy.id, active: event.target.checked })} /><span /></label></div></article>;
}

function AccessManagement({ workspace, canManage, busyId, onAction }: { workspace: WorkspaceData; canManage: boolean; busyId: string | null; onAction: (body: Record<string, unknown>) => Promise<void> }) {
  const [email, setEmail] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [role, setRole] = useState<OrganizationRole>("MEMBER");
  async function submit(event: FormEvent) {
    event.preventDefault();
    await onAction({ action: "INVITE_MEMBER", email, displayName, role });
    setEmail(""); setDisplayName(""); setRole("MEMBER");
  }
  return <section className="governance-stack"><div className="identity-banner"><span><KeyRound size={22} /></span><div><strong>ChatGPT Work identity + server-side RBAC</strong><p>Authentication comes from the signed-in ChatGPT user. Every API action re-checks organization membership and permission on the server.</p></div><span className="role-access">Signed in as {workspace.access.role.toLowerCase()}</span></div>
    <div className="access-grid"><article className="governance-card member-directory"><div className="governance-card-head"><span><Users size={18} /><strong>Organization members</strong></span><span>{workspace.memberships.length} visible</span></div>{workspace.memberships.map((member) => <div className="member-row" key={member.id}><span className="member-avatar">{initials(member.displayName)}</span><span><strong>{member.displayName}</strong><small>{member.email}</small></span><select value={member.role} disabled={!canManage || busyId === member.id} onChange={(event) => onAction({ action: "UPDATE_ROLE", membershipId: member.id, role: event.target.value })}>{["ADMIN", "MANAGER", "REVIEWER", "MEMBER"].map((option) => <option key={option}>{option}</option>)}</select><span className="member-status"><i />{member.status.toLowerCase()}</span></div>)}</article>
      <article className="governance-card invite-card"><div className="governance-card-head"><span><UserPlus size={18} /><strong>Add organization role</strong></span></div><p>Role assignment does not widen the Site access list. Add the person to Site access as well before they sign in.</p><form onSubmit={submit}><label className="field"><span>Name</span><input value={displayName} disabled={!canManage} onChange={(event) => setDisplayName(event.target.value)} placeholder="Jordan Lee" required /></label><label className="field"><span>Work email</span><input type="email" value={email} disabled={!canManage} onChange={(event) => setEmail(event.target.value)} placeholder="jordan@company.com" required /></label><label className="field"><span>Role</span><select value={role} disabled={!canManage} onChange={(event) => setRole(event.target.value as OrganizationRole)}><option value="MEMBER">Member · view</option><option value="REVIEWER">Reviewer · approve</option><option value="MANAGER">Manager · create and run</option><option value="ADMIN">Admin · full control</option></select></label><button className="primary-button" disabled={!canManage || busyId === email}><UserPlus size={16} />Add role assignment</button></form></article></div>
    <div className="permission-matrix governance-card"><div className="governance-card-head"><span><LockKeyhole size={18} /><strong>Permission matrix</strong></span></div><div className="permission-row permission-head"><span>Capability</span><span>Admin</span><span>Manager</span><span>Reviewer</span><span>Member</span></div>{[["View workspace",1,1,1,1],["Create tasks",1,1,0,0],["Run Bedrock agents",1,1,0,0],["Advance workflows",1,1,0,0],["Approve outputs",1,0,1,0],["Manage policies",1,0,0,0],["Manage roles",1,0,0,0]].map(([label,...values]) => <div className="permission-row" key={String(label)}><span>{label}</span>{values.map((value,index) => <span key={index}>{value ? <Check size={14} /> : "—"}</span>)}</div>)}</div>
  </section>;
}

function StatusDot({ ready }: { ready: boolean }) {
  return <span className={`secret-status ${ready ? "ready" : "missing"}`}><i />{ready ? "ready" : "missing"}</span>;
}

function PageHeading({ kicker, title, copy, action }: { kicker: string; title: string; copy: string; action?: React.ReactNode }) {
  return <section className="page-heading"><div><p className="section-kicker"><Sparkles size={14} />{kicker}</p><h2>{title}</h2><p>{copy}</p></div>{action}</section>;
}

function CompactMetric({ label, value, detail, icon }: { label: string; value: string; detail: string; icon: React.ReactNode }) {
  return <article><span>{icon}</span><div><small>{label}</small><strong>{value}</strong><p>{detail}</p></div></article>;
}

function EmptyState({ icon, title, copy }: { icon: React.ReactNode; title: string; copy: string }) {
  return <div className="empty-state"><span>{icon}</span><strong>{title}</strong><p>{copy}</p></div>;
}

function Score({ value }: { value: number }) {
  return <span className="score-value"><strong>{value}</strong><i><b style={{ width: `${value}%` }} /></i></span>;
}

function relativeTime(timestamp: number) {
  const diff = timestamp - Date.now();
  const absolute = Math.abs(diff);
  if (absolute < 60_000) return diff > 0 ? "in a moment" : "just now";
  if (absolute < 3_600_000) return `${diff > 0 ? "in " : ""}${Math.round(absolute / 60_000)}m${diff > 0 ? "" : " ago"}`;
  if (absolute < 86_400_000) return `${diff > 0 ? "in " : ""}${Math.round(absolute / 3_600_000)}h${diff > 0 ? "" : " ago"}`;
  return `${diff > 0 ? "in " : ""}${Math.round(absolute / 86_400_000)}d${diff > 0 ? "" : " ago"}`;
}
