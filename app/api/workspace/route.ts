import { accessErrorResponse, requireAccess } from "@/lib/access";
import { getAuthorizedWorkspace } from "@/lib/governance-store";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const access = await requireAccess("TASK_VIEW");
    return Response.json(await getAuthorizedWorkspace(access));
  } catch (error) {
    return accessErrorResponse(error, "Unable to load the workforce workspace.");
  }
}
