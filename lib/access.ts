import { getChatGPTUser } from "@/app/chatgpt-auth";
import { ensureDatabase, getRawDatabase } from "@/db/runtime";
import type { AccessContext, OrganizationRole, Permission } from "@/lib/types";

const rolePermissions: Record<OrganizationRole, Permission[]> = {
  ADMIN: ["TASK_VIEW", "TASK_CREATE", "TASK_RUN_AGENT", "TASK_ADVANCE", "TASK_APPROVE", "POLICY_MANAGE", "MEMBER_MANAGE"],
  MANAGER: ["TASK_VIEW", "TASK_CREATE", "TASK_RUN_AGENT", "TASK_ADVANCE"],
  REVIEWER: ["TASK_VIEW", "TASK_APPROVE"],
  MEMBER: ["TASK_VIEW"],
};

export class AccessError extends Error {
  constructor(message: string, public status: number) {
    super(message);
  }
}

function normalizeEmail(email: string) {
  return email.trim().toLowerCase();
}

export async function requireAccess(required?: Permission): Promise<AccessContext> {
  const authenticated = await getChatGPTUser();
  const developmentUser = process.env.NODE_ENV !== "production"
    ? { email: "jquan287619461@gmail.com", displayName: "Drewry Tran" }
    : null;
  const user = authenticated ?? developmentUser;
  if (!user) throw new AccessError("Sign in with ChatGPT to access this organization.", 401);

  await ensureDatabase();
  const database = getRawDatabase();
  const email = normalizeEmail(user.email);
  let membership = await database.prepare(`SELECT id, organization_id, email, display_name, role, status
    FROM memberships WHERE email = ? LIMIT 1`).bind(email).first<{
      id: string;
      organization_id: string;
      email: string;
      display_name: string;
      role: OrganizationRole;
      status: string;
    }>();

  if (!membership) {
    const count = await database.prepare("SELECT COUNT(*) AS count FROM memberships").first<{ count: number }>();
    const role: OrganizationRole = (count?.count ?? 0) === 0 ? "ADMIN" : "MEMBER";
    const timestamp = Date.now();
    await database.prepare(`INSERT INTO memberships
      (id, organization_id, email, display_name, role, status, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)`)
      .bind(`member-${crypto.randomUUID()}`, "org-northwind", email, user.displayName, role, "ACTIVE", timestamp, timestamp)
      .run();
    membership = {
      id: `member-${email}`,
      organization_id: "org-northwind",
      email,
      display_name: user.displayName,
      role,
      status: "ACTIVE",
    };
  }

  if (membership.status !== "ACTIVE") throw new AccessError("Your organization membership is inactive.", 403);
  const organization = await database.prepare("SELECT id, name FROM organizations WHERE id = ? LIMIT 1")
    .bind(membership.organization_id)
    .first<{ id: string; name: string }>();
  if (!organization) throw new AccessError("Organization not found.", 403);

  const permissions = rolePermissions[membership.role] ?? rolePermissions.MEMBER;
  if (required && !permissions.includes(required)) {
    throw new AccessError(`Your ${membership.role.toLowerCase()} role cannot perform this action.`, 403);
  }

  return {
    organizationId: organization.id,
    organizationName: organization.name,
    email: membership.email,
    displayName: membership.display_name,
    role: membership.role,
    permissions,
  };
}

export function accessErrorResponse(error: unknown, fallback: string) {
  if (error instanceof AccessError) return Response.json({ error: error.message }, { status: error.status });
  return Response.json({ error: error instanceof Error ? error.message : fallback }, { status: 500 });
}
