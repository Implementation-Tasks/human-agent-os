import type { CreateTaskInput } from "@/lib/types";
import { createTask } from "@/lib/workspace-store";
import { accessErrorResponse, requireAccess } from "@/lib/access";
import { getAuthorizedWorkspace } from "@/lib/governance-store";

export async function POST(request: Request) {
  try {
    const access = await requireAccess("TASK_CREATE");
    const payload = (await request.json()) as Partial<CreateTaskInput>;
    if (!payload.title?.trim() || !payload.description?.trim()) {
      return Response.json({ error: "Title and desired outcome are required." }, { status: 400 });
    }
    const input: CreateTaskInput = {
      title: payload.title,
      description: payload.description,
      category: payload.category ?? "GENERAL",
      urgency: payload.urgency ?? "MEDIUM",
      risk: Number(payload.risk ?? 5),
      sensitivity: Number(payload.sensitivity ?? 5),
      judgment: Number(payload.judgment ?? 5),
      verifiability: Number(payload.verifiability ?? 5),
      estimatedHours: Number(payload.estimatedHours ?? 8),
    };
    const result = await createTask(input, access.organizationId);
    return Response.json({ ...result, workspace: await getAuthorizedWorkspace(access) }, { status: 201 });
  } catch (error) {
    return accessErrorResponse(error, "Unable to create the task.");
  }
}
