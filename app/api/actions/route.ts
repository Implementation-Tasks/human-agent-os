import { advanceTask, decideApproval } from "@/lib/workspace-store";
import { accessErrorResponse, requireAccess } from "@/lib/access";
import { getAuthorizedWorkspace } from "@/lib/governance-store";

export async function POST(request: Request) {
  try {
    const payload = (await request.json()) as {
      action?: string;
      taskId?: string;
      approvalId?: string;
      note?: string;
    };

    if (payload.action === "ADVANCE_TASK" && payload.taskId) {
      const access = await requireAccess("TASK_ADVANCE");
      await advanceTask(payload.taskId);
      return Response.json(await getAuthorizedWorkspace(access));
    }
    if ((payload.action === "APPROVE" || payload.action === "REJECT") && payload.approvalId) {
      const access = await requireAccess("TASK_APPROVE");
      await decideApproval(payload.approvalId, payload.action === "APPROVE", payload.note ?? "");
      return Response.json(await getAuthorizedWorkspace(access));
    }
    return Response.json({ error: "Unsupported workflow action." }, { status: 400 });
  } catch (error) {
    return accessErrorResponse(error, "Unable to update the workflow.");
  }
}
