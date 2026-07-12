import { accessErrorResponse, requireAccess } from "@/lib/access";
import { runBedrockTaskAgent } from "@/lib/bedrock-agent";
import { getAuthorizedWorkspace } from "@/lib/governance-store";

export async function POST(request: Request) {
  try {
    const access = await requireAccess("TASK_RUN_AGENT");
    const payload = (await request.json()) as { taskId?: string };
    if (!payload.taskId) return Response.json({ error: "taskId is required." }, { status: 400 });
    const result = await runBedrockTaskAgent(payload.taskId, access);
    return Response.json({ ...result, workspace: await getAuthorizedWorkspace(access) });
  } catch (error) {
    return accessErrorResponse(error, "Unable to run the Amazon Bedrock agent.");
  }
}
