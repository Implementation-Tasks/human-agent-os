import { and, eq, like, or } from "drizzle-orm";
import { getDb } from "@/db";
import { policies, tasks, workers } from "@/db/schema";
import type { AccessContext } from "@/lib/types";

export const bedrockTools = [
  {
    toolSpec: {
      name: "lookup_organization_policies",
      description: "Look up active organization policies that govern data, risk, approvals, quality, and agent tool use.",
      inputSchema: {
        json: {
          type: "object",
          properties: {
            category: { type: "string", description: "Optional policy category such as RISK, DATA, APPROVAL, or QUALITY." },
          },
        },
      },
    },
  },
  {
    toolSpec: {
      name: "search_workforce",
      description: "Find approved human workers or AI agents by capability, name, role, or worker type.",
      inputSchema: {
        json: {
          type: "object",
          properties: {
            query: { type: "string", description: "Capability, name, or role to search for." },
            kind: { type: "string", enum: ["HUMAN", "AI_AGENT", "ANY"], description: "Worker type filter." },
          },
          required: ["query"],
        },
      },
    },
  },
  {
    toolSpec: {
      name: "search_tasks",
      description: "Search organization work history for related tasks, routes, owners, progress, and outcomes.",
      inputSchema: {
        json: {
          type: "object",
          properties: {
            query: { type: "string", description: "Task title, description, owner, or category to search for." },
            status: { type: "string", description: "Optional exact task status filter." },
          },
          required: ["query"],
        },
      },
    },
  },
];

type ToolInput = Record<string, unknown>;

export async function executeApprovedTool(name: string, input: ToolInput, access: AccessContext) {
  const db = getDb();
  if (name === "lookup_organization_policies") {
    const category = typeof input.category === "string" ? input.category.toUpperCase() : null;
    const rows = await db.select().from(policies).where(
      category
        ? and(eq(policies.organizationId, access.organizationId), eq(policies.active, true), eq(policies.category, category))
        : and(eq(policies.organizationId, access.organizationId), eq(policies.active, true)),
    );
    return rows.map((policy) => ({
      name: policy.name,
      category: policy.category,
      enforcement: policy.enforcement,
      condition: `${policy.metric} ${policy.operator} ${policy.threshold}`,
      description: policy.description,
    }));
  }

  if (name === "search_workforce") {
    const query = typeof input.query === "string" ? input.query.trim() : "";
    const kind = typeof input.kind === "string" ? input.kind : "ANY";
    const pattern = `%${query}%`;
    const match = or(like(workers.name, pattern), like(workers.role, pattern), like(workers.skills, pattern), like(workers.description, pattern));
    const rows = await db.select().from(workers).where(kind === "HUMAN" || kind === "AI_AGENT" ? and(eq(workers.kind, kind), match) : match).limit(8);
    return rows.map((worker) => ({
      id: worker.id,
      kind: worker.kind,
      name: worker.name,
      role: worker.role,
      skills: JSON.parse(worker.skills) as string[],
      availability: worker.availability,
      reliability: worker.reliability,
      status: worker.status,
    }));
  }

  if (name === "search_tasks") {
    const query = typeof input.query === "string" ? input.query.trim() : "";
    const status = typeof input.status === "string" ? input.status.toUpperCase() : null;
    const pattern = `%${query}%`;
    const match = or(like(tasks.title, pattern), like(tasks.description, pattern), like(tasks.assignee, pattern), like(tasks.category, pattern));
    const rows = await db.select().from(tasks).where(status ? and(eq(tasks.status, status), match) : match).limit(8);
    return rows.map((task) => ({
      id: task.id,
      title: task.title,
      category: task.category,
      route: task.route,
      status: task.status,
      assignee: task.assignee,
      confidence: task.confidence,
      outcome: task.outcomeLabel,
    }));
  }

  throw new Error(`Tool ${name} is not approved for this organization.`);
}
