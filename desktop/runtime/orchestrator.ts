import Ajv from "ajv";
import { createHash, randomUUID } from "node:crypto";
import type {
  ApprovalRequest,
  Database,
  Message,
  MCPConnection,
  MCPTool,
  ProviderInput,
  Attachment,
  ToolCall,
} from "../../src/types/domain";
import { connectionAvailable } from "../../src/lib/entitlements";
import type { Inference, ModelCall, Turn } from "../adapters/providers";
import type { MCPRuntime } from "../adapters/mcp";
import { DomainError, safeError } from "./errors";
const stamp = () => new Date().toISOString();
export function actionBinding(
  c: MCPConnection,
  t: MCPTool,
  args: Record<string, unknown>,
) {
  return createHash("sha256")
    .update(JSON.stringify([c.id, c.url, t.name, t.schemaHash, args]))
    .digest("hex");
}
interface Run {
  cid: string;
  message: Message;
  turns: Turn[];
  queue: ModelCall[];
  seen: Set<string>;
  rounds: number;
  controller: AbortController;
  busy: boolean;
  model: string;
}
export class Orchestrator {
  private runs = new Map<string, Run>();
  private starting = new Set<string>();
  private ajv = new Ajv({
    strict: false,
    allErrors: false,
    validateFormats: false,
  });
  constructor(
    private db: () => Database,
    private persist: () => Promise<void>,
    private notify: () => void,
    private inference: Inference,
    private mcp: MCPRuntime,
    private provider: (model: string) => Promise<ProviderInput>,
    private attachmentText: (
      attachments: Attachment[],
    ) => Promise<{ text: string; images: { mime: string; data: string }[] }>,
  ) {}
  private audit(
    cid: string,
    cid2: string,
    tool: string,
    action: string,
    outcome: ToolCall["status"],
    approval: boolean,
    detail = "",
  ) {
    this.db().activity.unshift({
      id: randomUUID(),
      timestamp: stamp(),
      actor: "G-Bot",
      conversationId: cid,
      connectionId: cid2,
      tool,
      action,
      outcome,
      approvalRequired: approval,
      detail,
    });
  }
  private available() {
    return this.db()
      .connections.filter((c) => connectionAvailable(this.db().entitlement, c))
      .flatMap((c) =>
        c.tools
          .filter((t) => t.enabled)
          .map((t) => ({
            c,
            t,
            name: `tool_${createHash("sha256").update(t.id).digest("hex").slice(0, 24)}`,
          })),
      );
  }
  private permitted(call: ModelCall) {
    const entry = this.available().find((x) => x.name === call.name);
    if (!entry)
      throw new DomainError(
        "TOOL_UNAVAILABLE",
        "The requested tool is unavailable or disabled. Reconnect the app, check its permissions and plan, then retry.",
      );
    try {
      if (
        !this.ajv.validate(
          entry.t.inputSchema ?? { type: "object" },
          call.arguments,
        )
      )
        throw new Error();
    } catch {
      throw new DomainError(
        "INVALID_ARGUMENTS",
        "Tool arguments do not match its discovered schema. Ask G-Bot to correct the request.",
      );
    }
    return entry;
  }
  async run(
    cid: string,
    prompt: string,
    model: string,
    attachments: Attachment[],
  ) {
    if (
      this.starting.has(cid) ||
      this.runs.get(cid)?.busy ||
      this.db().approvals.some(
        (a) => a.conversationId === cid && a.status === "pending",
      )
    )
      throw new DomainError(
        "INVALID_ARGUMENTS",
        "Finish or reject the current action first.",
      );
    this.starting.add(cid);
    try {
      await this.provider(model);
      const c = this.db().conversations.find((c) => c.id === cid);
      if (!c)
        throw new DomainError("INVALID_ARGUMENTS", "Conversation not found.");
      const extra = await this.attachmentText(attachments);
      const turns: Turn[] = c.messages
        .filter((m) => m.status === "completed")
        .slice(-20)
        .map((m) => ({ role: m.role, text: m.content }));
      c.messages.push({
        id: randomUUID(),
        role: "user",
        content: prompt,
        model,
        attachments,
        createdAt: stamp(),
        status: "completed",
        tools: [],
      });
      const message: Message = {
        id: randomUUID(),
        role: "assistant",
        content: "",
        model,
        attachments: [],
        createdAt: stamp(),
        status: "running",
        tools: [],
      };
      c.messages.push(message);
      c.title = c.title === "New conversation" ? prompt.slice(0, 70) : c.title;
      c.updatedAt = stamp();
      turns.push({
        role: "user",
        text: prompt + extra.text,
        images: extra.images,
      });
      const run: Run = {
        cid,
        message,
        turns,
        queue: [],
        seen: new Set(),
        rounds: 0,
        controller: new AbortController(),
        busy: false,
        model,
      };
      this.runs.set(cid, run);
      await this.persist();
      await this.advance(run);
    } finally {
      this.starting.delete(cid);
    }
  }
  private async execute(run: Run, call: ModelCall, approved?: ApprovalRequest) {
    const { c, t } = this.permitted(call);
    const key = actionBinding(c, t, call.arguments);
    if (t.requiresApproval && !approved) {
      const approval: ApprovalRequest = {
        id: randomUUID(),
        conversationId: run.cid,
        messageId: run.message.id,
        connectionId: c.id,
        toolId: t.id,
        action: t.label,
        consequence: `${c.name}: ${t.description}. This may change external business data. Review every parameter before approving.`,
        inputs: {
          recipient: c.name,
          subject: t.label,
          body: JSON.stringify(call.arguments, null, 2),
        },
        arguments: structuredClone(call.arguments),
        binding: key,
        executionState: "not started",
        status: "pending",
        createdAt: stamp(),
      };
      this.db().approvals.push(approval);
      run.message.approvalId = approval.id;
      run.message.status = "approval required";
      this.audit(
        run.cid,
        c.id,
        t.name,
        "Approval requested",
        "approval required",
        true,
      );
      await this.persist();
      return false;
    }
    if (
      approved &&
      (approved.binding !== key ||
        approved.status !== "approved" ||
        approved.executionState !== "not started")
    )
      throw new DomainError(
        "INVALID_ARGUMENTS",
        "This approval no longer matches the proposed action. Request a new action.",
      );
    if (run.seen.has(key))
      throw new DomainError(
        "TOOL_FAILED",
        "Stopped a repeated identical tool call. Refine the request to continue.",
      );
    const previous = run.message.tools.find((x) => x.id === call.id);
    const record: ToolCall = previous ?? {
      id: call.id,
      connectionId: c.id,
      toolId: t.id,
      label: t.label,
      input: JSON.stringify(call.arguments),
      status: "running",
      startedAt: stamp(),
      output: "",
      requiresApproval: t.requiresApproval,
    };
    if (!previous) run.message.tools.push(record);
    record.status = "running";
    record.error = undefined;
    if (approved) approved.executionState = "started";
    await this.persist();
    try {
      const current = this.permitted(call);
      if (actionBinding(current.c, current.t, call.arguments) !== key)
        throw new DomainError(
          "TOOL_UNAVAILABLE",
          "Tool configuration changed before execution. Request a new action.",
        );
      const output = await this.mcp.call(
        c,
        t,
        call.arguments,
        run.controller.signal,
      );
      run.seen.add(key);
      record.status = "completed";
      record.output =
        "Tool completed. Results supplied to your selected AI provider.";
      record.endedAt = stamp();
      if (approved) approved.executionState = "completed";
      run.turns.push({
        role: "tool",
        callId: call.id,
        name: call.name,
        text: output,
      });
      this.audit(
        run.cid,
        c.id,
        t.name,
        t.label,
        "completed",
        t.requiresApproval,
      );
      await this.persist();
      return true;
    } catch (e) {
      record.status = "failed";
      record.error = safeError(e).message;
      if (approved) {
        approved.executionState = "uncertain";
        run.seen.add(key);
        run.queue = [];
      }
      this.audit(
        run.cid,
        c.id,
        t.name,
        t.label,
        "failed",
        t.requiresApproval,
        record.error,
      );
      await this.persist();
      throw e;
    }
  }
  private async advance(run: Run) {
    if (run.busy)
      throw new DomainError(
        "INVALID_ARGUMENTS",
        "This request is already running.",
      );
    run.busy = true;
    run.message.status = "running";
    this.notify();
    try {
      while (true) {
        if (run.controller.signal.aborted)
          throw new DomainError(
            "CANCELLED",
            "Stopped. External actions already submitted may still complete; inspect Activity.",
          );
        while (run.queue.length) {
          if (!(await this.execute(run, run.queue[0]))) return;
          run.queue.shift();
        }
        if (run.rounds++ >= 12)
          throw new DomainError(
            "TOOL_FAILED",
            "Stopped at the 12-step reasoning limit. Start a narrower request.",
          );
        const config = await this.provider(run.model);
        const tools = this.available()
          .slice(0, 100)
          .map((x) => ({
            name: x.name,
            description: `${x.c.name}: ${x.t.description}`,
            schema: x.t.inputSchema ?? { type: "object" },
          }));
        const result = await this.inference.generate(
          config,
          run.turns,
          tools,
          run.controller.signal,
          (text) => {
            run.message.content += text;
            this.notify();
          },
        );
        run.turns.push({
          role: "assistant",
          text: result.text,
          calls: result.calls,
        });
        if (!result.calls.length) {
          run.message.status = "completed";
          this.runs.delete(run.cid);
          return;
        }
        run.queue = result.calls;
        await this.persist();
      }
    } catch (e) {
      const error = safeError(e);
      run.message.status = error.code === "CANCELLED" ? "cancelled" : "failed";
      run.message.content += `\n\n${error.message}`;
    } finally {
      run.busy = false;
      await this.persist();
    }
  }
  async resolve(
    id: string,
    approve: boolean,
    inputs?: ApprovalRequest["inputs"],
  ) {
    const a = this.db().approvals.find((x) => x.id === id);
    if (!a || a.status !== "pending")
      throw new DomainError(
        "INVALID_ARGUMENTS",
        "This approval has already been resolved or expired.",
      );
    const run = this.runs.get(a.conversationId);
    if (!run || run.busy)
      throw new DomainError(
        "INVALID_ARGUMENTS",
        "The original action is no longer active. Request it again.",
      );
    if (inputs && JSON.stringify(inputs) !== JSON.stringify(a.inputs))
      throw new DomainError(
        "INVALID_ARGUMENTS",
        "Changed parameters require a new proposal and approval. Reject this action and ask for the changes.",
      );
    const call = run.queue[0];
    if (!call)
      throw new DomainError("INVALID_ARGUMENTS", "No matching pending action.");
    const entry = approve
      ? this.permitted(call)
      : {
          c: this.db().connections.find((c) => c.id === a.connectionId),
          t: this.db()
            .connections.flatMap((c) => c.tools)
            .find((t) => t.id === a.toolId),
        };
    const { c, t } = entry;
    if (!c || !t) {
      a.status = "rejected";
      run.message.status = "cancelled";
      this.runs.delete(run.cid);
      await this.persist();
      return;
    }
    if (approve && a.binding !== actionBinding(c, t, call.arguments))
      throw new DomainError(
        "INVALID_ARGUMENTS",
        "Connection or tool changed. Reject this approval and request a new action.",
      );
    a.status = approve ? "approved" : "rejected";
    a.resolvedAt = stamp();
    this.audit(
      run.cid,
      c.id,
      t.name,
      approve ? "Action approved" : "Action rejected",
      approve ? "running" : "cancelled",
      true,
    );
    await this.persist();
    if (!approve) {
      run.seen.add(a.binding!);
      run.queue.shift();
      run.turns.push({
        role: "tool",
        callId: call.id,
        name: call.name,
        text: "User rejected this action. Do not retry or substitute another mutation.",
      });
    } else {
      run.busy = true;
      try {
        await this.execute(run, call, a);
        run.queue.shift();
      } catch (e) {
        run.message.status = "failed";
        run.message.content += `\n\n${safeError(e).message}`;
        await this.persist();
        return;
      } finally {
        run.busy = false;
      }
    }
    await this.advance(run);
  }
  stop(cid: string) {
    this.runs.get(cid)?.controller.abort();
    for (const a of this.db().approvals.filter(
      (a) => a.conversationId === cid && a.status === "pending",
    )) {
      a.status = "cancelled";
    }
    this.notify();
  }
  async retry(cid: string) {
    const run = this.runs.get(cid);
    if (!run) {
      const c = this.db().conversations.find((c) => c.id === cid),
        last = c?.messages.at(-1),
        user = c?.messages.filter((m) => m.role === "user").at(-1);
      if (last?.status === "completed" && user)
        return this.run(cid, user.content, user.model, []);
      throw new DomainError(
        "INVALID_ARGUMENTS",
        "This run cannot be resumed after restart. Start a new request using the saved conversation context.",
      );
    }
    if (
      this.db().approvals.some(
        (a) => a.conversationId === cid && a.executionState === "uncertain",
      )
    )
      throw new DomainError(
        "TOOL_FAILED",
        "An external action has an uncertain outcome. Verify it in the business app before requesting another action.",
      );
    run.controller = new AbortController();
    await this.advance(run);
  }
  stopAll() {
    for (const cid of this.runs.keys()) this.stop(cid);
  }
}
