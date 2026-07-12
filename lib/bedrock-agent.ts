import { AwsClient } from "aws4fetch";
import { and, eq } from "drizzle-orm";
import { getDb } from "@/db";
import { getRuntimeConfig } from "@/db/runtime";
import {
  agentRuns,
  approvals,
  auditEvents,
  policies,
  tasks,
  toolCalls,
  workers,
} from "@/db/schema";
import { bedrockTools, executeApprovedTool } from "@/lib/agent-tools";
import type { AccessContext, Task } from "@/lib/types";
import { recordEvaluation } from "@/lib/workspace-store";

function parseJson<T>(value: string, fallback: T): T {
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}

function normalizeTask(row: typeof tasks.$inferSelect): Task {
  return {
    ...row,
    route: row.route as Task["route"],
    assigneeIds: parseJson<string[]>(row.assigneeIds, []),
    rationale: parseJson<string[]>(row.rationale, []),
  };
}

type BedrockToolUse = {
  toolUseId?: string;
  name?: string;
  input?: Record<string, unknown>;
};

type BedrockContentBlock = {
  text?: string;
  toolUse?: BedrockToolUse;
  toolResult?: {
    toolUseId?: string;
    content: Array<{ json: unknown }>;
    status: "success" | "error";
  };
};

type BedrockMessage = {
  role: "user" | "assistant";
  content: BedrockContentBlock[];
};

type BedrockConverseResponse = {
  output?: { message?: BedrockMessage };
  usage?: { inputTokens?: number; outputTokens?: number };
  metrics?: { latencyMs?: number };
};

function textFromContent(content: BedrockContentBlock[] | undefined) {
  return (content ?? []).flatMap((block) => ("text" in block && block.text ? [block.text] : [])).join("\n").trim();
}

async function converseWithBedrock(
  client: AwsClient,
  region: string,
  modelId: string,
  input: Record<string, unknown>,
) {
  const endpoint = `https://bedrock-runtime.${region}.amazonaws.com/model/${encodeURIComponent(modelId)}/converse`;
  const response = await client.fetch(endpoint, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(input),
  });
  const body = await response.text();
  let payload: Record<string, unknown> = {};
  try {
    payload = body ? JSON.parse(body) as Record<string, unknown> : {};
  } catch {
    if (!response.ok) throw new Error(`Amazon Bedrock returned HTTP ${response.status}: ${body.slice(0, 300)}`);
  }
  if (!response.ok) {
    const code = typeof payload.__type === "string" ? payload.__type.split("#").pop() : "BedrockError";
    const message = typeof payload.message === "string" ? payload.message : typeof payload.Message === "string" ? payload.Message : body.slice(0, 500);
    throw new Error(`${code} (${response.status}): ${message}`);
  }
  return payload as BedrockConverseResponse;
}

export async function runBedrockTaskAgent(taskId: string, access: AccessContext) {
  const db = getDb();
  const [taskRow] = await db.select().from(tasks).where(eq(tasks.id, taskId)).limit(1);
  if (!taskRow) throw new Error("Task not found.");
  const task = normalizeTask(taskRow);
  if (task.route === "HUMAN") throw new Error("This task is governed as human-only work.");
  if (!["RUNNING", "ASSIGNED", "NEEDS_REVISION"].includes(task.status)) throw new Error("This task is not ready for an agent run.");

  const runtime = getRuntimeConfig();
  const runId = `run-${crypto.randomUUID()}`;
  const createdAt = Date.now();
  const agentId = task.assigneeIds.find((id) => id.startsWith("agent-")) ?? "agent-research";
  const [agent] = await db.select().from(workers).where(eq(workers.id, agentId)).limit(1);
  const policyRows = await db.select().from(policies).where(and(eq(policies.organizationId, access.organizationId), eq(policies.active, true)));
  const prompt = `Complete this organization task and produce a decision-ready output.\n\nTask: ${task.title}\nObjective: ${task.description}\nCategory: ${task.category}\nRisk: ${task.risk}/10\nData sensitivity: ${task.sensitivity}/10\nJudgment required: ${task.judgment}/10\nVerifiability: ${task.verifiability}/10\nAssigned agent: ${agent?.name ?? task.assignee}\n\nUse approved tools when organization context would improve the answer. Clearly distinguish evidence, analysis, recommendations, assumptions, and items requiring human review.`;

  await db.insert(agentRuns).values({
    id: runId,
    organizationId: access.organizationId,
    taskId: task.id,
    agentId,
    requestedBy: access.email,
    modelId: runtime.modelId,
    status: "RUNNING",
    prompt,
    output: "",
    error: "",
    inputTokens: 0,
    outputTokens: 0,
    latencyMs: 0,
    createdAt,
    completedAt: null,
  });

  if (!runtime.accessKeyId || !runtime.secretAccessKey) {
    const message = "Amazon Bedrock is not configured. Add AWS credentials to the Site's protected runtime secrets.";
    await db.update(agentRuns).set({ status: "FAILED", error: message, completedAt: Date.now() }).where(eq(agentRuns.id, runId));
    throw new Error(message);
  }

  const client = new AwsClient({
    service: "bedrock",
    region: runtime.region,
    accessKeyId: runtime.accessKeyId,
    secretAccessKey: runtime.secretAccessKey,
    sessionToken: runtime.sessionToken,
    retries: 2,
  });
  const policyText = policyRows.map((policy) => `- ${policy.name}: ${policy.description} [${policy.enforcement}; ${policy.metric} ${policy.operator} ${policy.threshold}]`).join("\n");
  const systemPrompt = `You are ${agent?.name ?? "an approved AI agent"} operating inside ${access.organizationName}. You must obey organization policies and use only the tools provided in this request. Never invent tool results, permissions, completed actions, or evidence. You cannot change records or contact people. Escalate uncertainty, policy conflicts, sensitive decisions, and material business judgment to a human reviewer.\n\nActive policies:\n${policyText}`;
  const messages: BedrockMessage[] = [{ role: "user", content: [{ text: prompt }] }];
  let finalOutput = "";
  let inputTokens = 0;
  let outputTokens = 0;
  let latencyMs = 0;
  let toolCallCount = 0;

  try {
    for (let step = 0; step < 4; step += 1) {
      const input: Record<string, unknown> = {
        modelId: runtime.modelId,
        system: [{ text: systemPrompt }],
        messages,
        toolConfig: { tools: bedrockTools },
        inferenceConfig: { maxTokens: 1800, temperature: 0.2, topP: 0.9 },
        requestMetadata: {
          organization: access.organizationId,
          task: task.id,
          run: runId,
        },
      };
      if (runtime.guardrailId && runtime.guardrailVersion) {
        input.guardrailConfig = {
          guardrailIdentifier: runtime.guardrailId,
          guardrailVersion: runtime.guardrailVersion,
          trace: "enabled",
        };
      }

      const response = await converseWithBedrock(client, runtime.region, runtime.modelId, input);
      inputTokens += response.usage?.inputTokens ?? 0;
      outputTokens += response.usage?.outputTokens ?? 0;
      latencyMs += response.metrics?.latencyMs ?? 0;
      const assistantMessage = response.output?.message;
      if (!assistantMessage) throw new Error("Bedrock returned no assistant message.");
      messages.push(assistantMessage);
      const requestedTools = (assistantMessage.content ?? []).flatMap((block) => ("toolUse" in block && block.toolUse ? [block.toolUse] : []));

      if (!requestedTools.length) {
        finalOutput = textFromContent(assistantMessage.content);
        break;
      }

      const resultBlocks: BedrockContentBlock[] = [];
      for (const request of requestedTools) {
        const toolStarted = Date.now();
        const toolName = request.name ?? "unknown";
        const toolInput = (request.input ?? {}) as Record<string, unknown>;
        let result: unknown;
        let status = "SUCCESS";
        try {
          result = await executeApprovedTool(toolName, toolInput, access);
        } catch (error) {
          status = "ERROR";
          result = { error: error instanceof Error ? error.message : "Tool execution failed." };
        }
        const duration = Date.now() - toolStarted;
        toolCallCount += 1;
        await db.insert(toolCalls).values({
          id: `tool-${crypto.randomUUID()}`,
          agentRunId: runId,
          toolName,
          input: JSON.stringify(toolInput),
          output: JSON.stringify(result),
          status,
          durationMs: duration,
          createdAt: Date.now(),
        });
        resultBlocks.push({
          toolResult: {
            toolUseId: request.toolUseId,
            // Bedrock's Converse API requires the `json` value to be an
            // object. Organization tools often return arrays, so preserve the
            // value under a stable object key before returning it to the model.
            content: [{ json: { result } }],
            status: status === "SUCCESS" ? "success" : "error",
          },
        });
      }
      messages.push({ role: "user", content: resultBlocks });
    }

    // Some models continue requesting tools even after enough evidence has
    // been collected. Make one final tools-disabled call so every bounded run
    // has an opportunity to produce a user-facing answer instead of failing
    // solely because the tool budget was exhausted.
    if (!finalOutput) {
      const finalInput: Record<string, unknown> = {
        modelId: runtime.modelId,
        system: [{
          text: `${systemPrompt}\n\nThe approved tool budget is now exhausted. Do not request or claim any additional tool calls. Produce the final decision-ready output using only the task and tool evidence already present in the conversation. Clearly state evidence, recommendations, assumptions, and items requiring human review.`,
        }],
        messages,
        inferenceConfig: { maxTokens: 1800, temperature: 0.2, topP: 0.9 },
        requestMetadata: {
          organization: access.organizationId,
          task: task.id,
          run: runId,
          phase: "finalization",
        },
      };
      if (runtime.guardrailId && runtime.guardrailVersion) {
        finalInput.guardrailConfig = {
          guardrailIdentifier: runtime.guardrailId,
          guardrailVersion: runtime.guardrailVersion,
          trace: "enabled",
        };
      }
      const response = await converseWithBedrock(client, runtime.region, runtime.modelId, finalInput);
      inputTokens += response.usage?.inputTokens ?? 0;
      outputTokens += response.usage?.outputTokens ?? 0;
      latencyMs += response.metrics?.latencyMs ?? 0;
      finalOutput = textFromContent(response.output?.message?.content);
    }

    if (!finalOutput) throw new Error("The agent reached its tool-step limit without producing a final output.");
    const completedAt = Date.now();
    await db.update(agentRuns).set({
      status: "COMPLETED",
      output: finalOutput,
      inputTokens,
      outputTokens,
      latencyMs,
      completedAt,
    }).where(eq(agentRuns.id, runId));

    const nextStatus = task.approvalRequired ? "WAITING_APPROVAL" : "COMPLETED";
    await db.update(tasks).set({
      status: nextStatus,
      progress: task.approvalRequired ? 88 : 100,
      outcomeLabel: task.approvalRequired ? "Agent output awaiting approval" : "Agent output completed",
      updatedAt: completedAt,
    }).where(eq(tasks.id, task.id));

    if (task.approvalRequired) {
      const pending = await db.select().from(approvals).where(and(eq(approvals.taskId, task.id), eq(approvals.status, "PENDING"))).limit(1);
      if (!pending.length) {
        await db.insert(approvals).values({
          id: `approval-${crypto.randomUUID()}`,
          taskId: task.id,
          title: `Approve ${task.title}`,
          summary: `Bedrock completed the assigned agent step using ${toolCallCount} approved tool call${toolCallCount === 1 ? "" : "s"}. Review the output before release.`,
          requestedBy: agent?.name ?? task.assignee,
          riskLevel: task.risk >= 8 ? "HIGH" : task.risk >= 5 ? "MEDIUM" : "LOW",
          status: "PENDING",
          dueAt: completedAt + 86_400_000,
          createdAt: completedAt,
          decidedAt: null,
          note: "",
        });
      }
    } else {
      await recordEvaluation(task);
    }

    await db.insert(auditEvents).values({
      id: `audit-${crypto.randomUUID()}`,
      taskId: task.id,
      action: "BEDROCK_AGENT_COMPLETED",
      actor: `${agent?.name ?? "AI agent"} via Amazon Bedrock`,
      detail: `${runtime.modelId} completed the run with ${toolCallCount} approved tool call${toolCallCount === 1 ? "" : "s"} and ${inputTokens + outputTokens} tokens.`,
      createdAt: completedAt,
    });
    return { runId, output: finalOutput };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Amazon Bedrock agent execution failed.";
    await db.update(agentRuns).set({ status: "FAILED", error: message, inputTokens, outputTokens, latencyMs, completedAt: Date.now() }).where(eq(agentRuns.id, runId));
    await db.insert(auditEvents).values({
      id: `audit-${crypto.randomUUID()}`,
      taskId: task.id,
      action: "BEDROCK_AGENT_FAILED",
      actor: "Orchestra agent runtime",
      detail: message.slice(0, 500),
      createdAt: Date.now(),
    });
    throw error;
  }
}