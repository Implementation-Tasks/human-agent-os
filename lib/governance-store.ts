import { desc, eq } from "drizzle-orm";
import { getDb } from "@/db";
import { ensureDatabase, getRawDatabase, getRuntimeConfig } from "@/db/runtime";
import {
  agentRuns as agentRunsTable,
  memberships as membershipsTable,
  policies as policiesTable,
  toolCalls as toolCallsTable,
} from "@/db/schema";
import { getWorkspace } from "@/lib/workspace-store";
import type {
  AccessContext,
  AgentRun,
  AgentToolCall,
  Membership,
  OrganizationPolicy,
  OrganizationRole,
  WorkspaceData,
} from "@/lib/types";

function normalizePolicy(row: typeof policiesTable.$inferSelect): OrganizationPolicy {
  return row;
}

function normalizeMembership(row: typeof membershipsTable.$inferSelect): Membership {
  return { ...row, role: row.role as OrganizationRole };
}

function normalizeAgentRun(row: typeof agentRunsTable.$inferSelect): AgentRun {
  return row;
}

function normalizeToolCall(row: typeof toolCallsTable.$inferSelect): AgentToolCall {
  return row;
}

export async function getAuthorizedWorkspace(access: AccessContext): Promise<WorkspaceData> {
  await ensureDatabase();
  const db = getDb();
  const [core, policyRows, memberRows, runRows, toolRows] = await Promise.all([
    getWorkspace(),
    db.select().from(policiesTable).where(eq(policiesTable.organizationId, access.organizationId)).orderBy(policiesTable.category, policiesTable.name),
    db.select().from(membershipsTable).where(eq(membershipsTable.organizationId, access.organizationId)).orderBy(membershipsTable.role, membershipsTable.displayName),
    db.select().from(agentRunsTable).where(eq(agentRunsTable.organizationId, access.organizationId)).orderBy(desc(agentRunsTable.createdAt)).limit(30),
    db.select().from(toolCallsTable).orderBy(desc(toolCallsTable.createdAt)).limit(100),
  ]);
  const runtime = getRuntimeConfig();

  return {
    ...core,
    access,
    policies: policyRows.map(normalizePolicy),
    memberships: access.permissions.includes("MEMBER_MANAGE") ? memberRows.map(normalizeMembership) : memberRows.filter((row) => row.email === access.email).map(normalizeMembership),
    agentRuns: runRows.map(normalizeAgentRun),
    toolCalls: toolRows.map(normalizeToolCall),
    bedrock: {
      configured: Boolean(runtime.accessKeyId && runtime.secretAccessKey),
      region: runtime.region,
      modelId: runtime.modelId,
      guardrailEnabled: Boolean(runtime.guardrailId && runtime.guardrailVersion),
      guardrailId: runtime.guardrailId ?? null,
    },
  };
}

export async function updatePolicy(policyId: string, changes: { active?: boolean; threshold?: number }, actor: AccessContext) {
  await ensureDatabase();
  const db = getDb();
  const [policy] = await db.select().from(policiesTable).where(eq(policiesTable.id, policyId)).limit(1);
  if (!policy || policy.organizationId !== actor.organizationId) throw new Error("Policy not found.");
  await db.update(policiesTable).set({
    active: changes.active ?? policy.active,
    threshold: changes.threshold === undefined ? policy.threshold : Math.max(1, Math.min(10, changes.threshold)),
    updatedAt: Date.now(),
  }).where(eq(policiesTable.id, policyId));
}

export async function inviteMember(input: { email: string; displayName: string; role: OrganizationRole }, actor: AccessContext) {
  await ensureDatabase();
  const database = getRawDatabase();
  const email = input.email.trim().toLowerCase();
  if (!email.includes("@")) throw new Error("A valid email address is required.");
  const timestamp = Date.now();
  await database.prepare(`INSERT INTO memberships
    (id, organization_id, email, display_name, role, status, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(email) DO UPDATE SET display_name = excluded.display_name, role = excluded.role, status = 'ACTIVE', updated_at = excluded.updated_at`)
    .bind(`member-${crypto.randomUUID()}`, actor.organizationId, email, input.displayName.trim() || email, input.role, "ACTIVE", timestamp, timestamp)
    .run();
}

export async function updateMemberRole(membershipId: string, role: OrganizationRole, actor: AccessContext) {
  await ensureDatabase();
  const db = getDb();
  const [membership] = await db.select().from(membershipsTable).where(eq(membershipsTable.id, membershipId)).limit(1);
  if (!membership || membership.organizationId !== actor.organizationId) throw new Error("Member not found.");
  if (membership.email === actor.email && role !== "ADMIN") throw new Error("You cannot remove your own administrator access.");
  await db.update(membershipsTable).set({ role, updatedAt: Date.now() }).where(eq(membershipsTable.id, membershipId));
}
