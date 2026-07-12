import { accessErrorResponse, requireAccess } from "@/lib/access";
import { getAuthorizedWorkspace, inviteMember, updateMemberRole, updatePolicy } from "@/lib/governance-store";
import type { OrganizationRole } from "@/lib/types";

export async function POST(request: Request) {
  try {
    const payload = (await request.json()) as {
      action?: string;
      policyId?: string;
      active?: boolean;
      threshold?: number;
      membershipId?: string;
      email?: string;
      displayName?: string;
      role?: OrganizationRole;
    };

    if (payload.action === "UPDATE_POLICY" && payload.policyId) {
      const access = await requireAccess("POLICY_MANAGE");
      await updatePolicy(payload.policyId, { active: payload.active, threshold: payload.threshold }, access);
      return Response.json(await getAuthorizedWorkspace(access));
    }
    if (payload.action === "INVITE_MEMBER" && payload.email && payload.role) {
      const access = await requireAccess("MEMBER_MANAGE");
      await inviteMember({ email: payload.email, displayName: payload.displayName ?? payload.email, role: payload.role }, access);
      return Response.json(await getAuthorizedWorkspace(access));
    }
    if (payload.action === "UPDATE_ROLE" && payload.membershipId && payload.role) {
      const access = await requireAccess("MEMBER_MANAGE");
      await updateMemberRole(payload.membershipId, payload.role, access);
      return Response.json(await getAuthorizedWorkspace(access));
    }
    return Response.json({ error: "Unsupported governance action." }, { status: 400 });
  } catch (error) {
    return accessErrorResponse(error, "Unable to update organization governance.");
  }
}
