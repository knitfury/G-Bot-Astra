import type {
  ApprovalRequest,
  Attachment,
  Category,
  Conversation,
  Message,
  ToolCall,
} from "@/types/domain";
import { connectionAvailable } from "@/lib/entitlements";
import { stamp, uid } from "@/lib/utils";
import { delay, get, persist } from "./database";
const controllers = new Map<string, AbortController>();
const log = (conversationId: string, t: ToolCall) => {
  get().activity.unshift({
    id: uid(),
    timestamp: stamp(),
    actor: "G-Bot",
    conversationId,
    connectionId: t.connectionId,
    tool: t.toolId,
    action: t.label,
    outcome: t.status,
    approvalRequired: t.requiresApproval,
    detail: t.output || t.error || "",
  });
};
const assertOnline = () => {
  if (get().diagnostics.offline)
    throw new Error(
      "Offline simulation is enabled. Reconnect in Settings, then retry.",
    );
};
export function permitted(category: Category, write = false) {
  assertOnline();
  const c = get().connections.find(
    (c) => c.category === category && connectionAvailable(get().entitlement, c),
  );
  if (!c)
    throw new Error(
      `${category} is unavailable. Connect it and check your plan allowance.`,
    );
  const tool = c.tools.find(
    (t) => t.enabled && (write ? t.risk === "write" : t.risk === "read"),
  );
  if (!tool)
    throw new Error(
      `${category} permission is disabled or no tools were discovered. Enable the required tool in Connected Apps.`,
    );
  return { c, tool };
}
function availableModel(model: string) {
  const provider = get().providers.find(
    (p) =>
      p.status === "connected" &&
      p.models.some((m) => m.id === model && m.enabled),
  );
  if (!provider || get().diagnostics.providerFailure)
    throw new Error(
      "The selected AI model is unavailable. Test or reconnect the provider, then retry.",
    );
  return provider;
}
const ensureLive = (signal: AbortSignal) => {
  if (signal.aborted) throw new DOMException("Stopped", "AbortError");
};
function recordFor(category: Category, customer: string) {
  return get().records.find(
    (r) => r.category === category && r.customer === customer,
  )!;
}
async function perform(
  conversation: Conversation,
  message: Message,
  prompt: string,
  retry = false,
) {
  const control = new AbortController();
  controllers.set(conversation.id, control);
  const signal = control.signal;
  message.status = "running";
  persist();
  try {
    assertOnline();
    availableModel(message.model);
    const context = conversation.messages
      .filter((m) => m.role === "user")
      .map((m) => m.content)
      .join(" ")
      .toLowerCase();
    const customer = /northwind|leo/.test(context)
      ? "Leo Chen"
      : /amara|fern/.test(context)
        ? "Amara Patel"
        : "Maya Dawson";
    const scenario =
      conversation.scenario ||
      (/ticket|support|issue/.test(prompt.toLowerCase())
        ? "support"
        : /invoice/.test(prompt.toLowerCase())
          ? "summary"
          : "inventory");
    conversation.scenario = scenario;
    const steps: Category[] =
      scenario === "support"
        ? ["Email", "CRM"]
        : scenario === "summary"
          ? ["Accounting"]
          : ["Email", "Inventory"];
    for (const category of steps) {
      const previous = message.tools.find((t) => t.input === category);
      if (retry && previous?.status === "completed") continue;
      const call: ToolCall = previous || {
        id: uid(),
        connectionId: "",
        toolId: "",
        label:
          category === "Email"
            ? "Find latest customer email"
            : category === "Inventory"
              ? "Check product availability"
              : category === "CRM"
                ? "Find customer profile"
                : "Review outstanding invoices",
        input: category,
        status: "queued",
        startedAt: stamp(),
        output: "",
        requiresApproval: false,
      };
      if (!previous) message.tools.push(call);
      call.status = "running";
      call.error = undefined;
      call.startedAt = stamp();
      persist();
      await delay(650);
      ensureLive(signal);
      try {
        const { c, tool } = permitted(category);
        call.connectionId = c.id;
        call.toolId = tool.name;
        if (
          (category === "Inventory" && get().diagnostics.inventoryFailure) ||
          get().diagnostics.toolFailure
        )
          throw new Error(
            `${category} did not respond. Successful earlier results have been kept.`,
          );
        const record = recordFor(category, customer);
        call.output =
          category === "Inventory"
            ? `${record.metadata.stock} × ${record.title} (${record.metadata.SKU}) in ${record.metadata.location}.`
            : category === "Email"
              ? `${record.customer}: ${record.body}`
              : record.body;
        call.status = "completed";
        call.endedAt = stamp();
        log(conversation.id, call);
        persist();
      } catch (error) {
        call.status = "failed";
        call.error = error instanceof Error ? error.message : "Tool failed.";
        call.endedAt = stamp();
        log(conversation.id, call);
        throw error;
      }
    }
    ensureLive(signal);
    const email = recordFor("Email", customer),
      stock = recordFor("Inventory", customer);
    const sufficient =
      Number(stock.metadata.stock) >= Number(stock.metadata.quantity);
    const draft =
      scenario === "support"
        ? `Customer: ${customer} · ${email.company}\nOrder: ${email.metadata.order}\n\n${email.body}\n\nPriority: High\nRequested action: Investigate the display disconnects and contact ${email.metadata.email}.`
        : `Hi ${customer.split(" ")[0]},\n\n${sufficient ? `Good news — we have ${stock.metadata.stock} ${stock.metadata.product}s available in our ${stock.metadata.location} warehouse, enough for your requested ${stock.metadata.quantity}.` : `We currently have ${stock.metadata.stock} ${stock.metadata.product}s available, which is fewer than your requested ${stock.metadata.quantity}. I can help check a split delivery.`}\n\nWe will confirm the delivery date before reserving stock. Your order reference is ${stock.metadata.order}.\n\nBest,\nAlex`;
    const result =
      scenario === "summary"
        ? `### Outstanding invoices\n\n| Customer | Order | Status |\n|---|---|---|\n${get()
            .records.filter((r) => r.category === "Accounting")
            .map((r) => `| ${r.company} | ${r.metadata.order} | ${r.status} |`)
            .join(
              "\n",
            )}\n\nThese simulated invoices are due September 30. No payment requests have been sent.`
        : scenario === "support"
          ? `### Support ticket prepared\n\nI found **${customer}** in Email and CRM and linked order **${email.metadata.order}**. Review the ticket below before it is created.`
          : `### ${sufficient ? "Available and ready for your reply" : "Partial stock available"}\n\n${customer} asked for **${stock.metadata.quantity} × ${stock.metadata.product}**. Inventory reports **${stock.metadata.stock} in stock**.\n\n| Product | SKU | Available | Location |\n|---|---|---|---|\n| ${stock.title} | ${stock.metadata.SKU} | ${stock.metadata.stock} | ${stock.metadata.location} |\n\n### Prepared response\n\n${draft}\n\n*Draft only. No email has been sent and no stock has been reserved.*`;
    message.content = "";
    const chunks = result.match(/.{1,90}(?:\s|$)|.{1,90}/gs) || [result];
    for (const chunk of chunks) {
      ensureLive(signal);
      message.content += chunk;
      persist();
      await delay(35);
    }
    if (scenario === "support" || /send|email it/i.test(prompt)) {
      const category: Category = scenario === "support" ? "Helpdesk" : "Email";
      const { c, tool } = permitted(category, true);
      const approval: ApprovalRequest = {
        id: uid(),
        conversationId: conversation.id,
        messageId: message.id,
        connectionId: c.id,
        toolId: tool.id,
        action:
          scenario === "support"
            ? "Create support ticket"
            : "Send customer email",
        consequence:
          scenario === "support"
            ? "Creates one simulated ticket in Support Desk. No real support system is contacted."
            : "Sends this draft in the simulation. No real email is delivered.",
        inputs: {
          recipient: email.metadata.email,
          subject: scenario === "support" ? email.title : `Re: ${email.title}`,
          body: draft,
        },
        status: "pending",
        createdAt: stamp(),
      };
      get().approvals.push(approval);
      message.approvalId = approval.id;
      message.status = "approval required";
    } else message.status = "completed";
  } catch (error) {
    if (signal.aborted) {
      message.status = "cancelled";
      message.tools.forEach((t) => {
        if (t.status === "running" || t.status === "queued")
          t.status = "cancelled";
      });
      message.content =
        message.content ||
        "Generation stopped. Completed tool results are preserved.";
    } else {
      message.status = "failed";
      message.content =
        (message.content ? message.content + "\n\n" : "") +
        `**Task paused.** ${error instanceof Error ? error.message : "An unexpected error occurred."}\n\n${message.tools.some((t) => t.status === "completed") ? "Completed results above are preserved. The remaining steps and consequential action were not executed." : "No consequential action was executed."} Fix the connection or simulation setting, then retry. You can also review the customer context in a side pane.`;
    }
  } finally {
    conversation.updatedAt = stamp();
    if (controllers.get(conversation.id) === control)
      controllers.delete(conversation.id);
    persist();
  }
}
export const execution = {
  async run(
    cid: string,
    prompt: string,
    model: string,
    attachments: Attachment[],
  ) {
    if (controllers.has(cid)) throw new Error("A request is already running.");
    if (
      get().approvals.some(
        (a) => a.conversationId === cid && a.status === "pending",
      )
    )
      throw new Error("Approve or reject the pending action first.");
    const c = get().conversations.find((c) => c.id === cid);
    if (!c) throw new Error("Conversation not found.");
    if (!prompt.trim() && !attachments.length) return;
    const user: Message = {
      id: uid(),
      role: "user",
      content: prompt || "Review attached context",
      createdAt: stamp(),
      attachments,
      model,
      tools: [],
      status: "completed",
    };
    c.messages.push(user);
    if (c.messages.length === 1)
      c.title = prompt.slice(0, 58) || "Review attachments";
    const message: Message = {
      id: uid(),
      role: "assistant",
      content: "",
      createdAt: stamp(),
      attachments: [],
      model,
      tools: [],
      status: "running",
    };
    c.messages.push(message);
    await perform(c, message, prompt);
  },
  stop(cid: string) {
    controllers.get(cid)?.abort();
  },
  async retry(cid: string) {
    if (controllers.has(cid)) return;
    const c = get().conversations.find((c) => c.id === cid);
    const message = c?.messages.filter((m) => m.role === "assistant").at(-1);
    const user = c?.messages.filter((m) => m.role === "user").at(-1);
    if (!c || !message || !user) return;
    if (message.approvalId) {
      const a = get().approvals.find((a) => a.id === message.approvalId);
      if (a?.status === "pending" || a?.status === "approved")
        throw new Error(
          "This action already has an approval. Start a new request instead.",
        );
    }
    message.content = "";
    await perform(c, message, user.content, true);
  },
};
export function stopAll() {
  controllers.forEach((c) => c.abort());
}
export async function resolveApproval(
  id: string,
  approve: boolean,
  inputs?: ApprovalRequest["inputs"],
) {
  const a = get().approvals.find((a) => a.id === id);
  if (!a || a.status !== "pending")
    throw new Error("This approval has already been resolved.");
  if (approve) {
    assertOnline();
    const c = get().connections.find((c) => c.id === a.connectionId);
    if (!c || !connectionAvailable(get().entitlement, c))
      throw new Error(
        "This connection is unavailable under your current plan. Reconnect or restore access.",
      );
    if (!c.tools.find((t) => t.id === a.toolId && t.enabled))
      throw new Error(
        "Permission was removed. Enable the required tool before approving.",
      );
    if (get().diagnostics.toolFailure)
      throw new Error(
        "The action failed in simulation. Turn off tool failure and retry approval.",
      );
  }
  if (inputs) {
    if (
      !inputs.recipient.includes("@") ||
      !inputs.subject.trim() ||
      !inputs.body.trim()
    )
      throw new Error("Recipient, subject and message are required.");
    a.inputs = inputs;
  }
  a.status = approve ? "approved" : "rejected";
  a.resolvedAt = stamp();
  const m = get()
    .conversations.find((c) => c.id === a.conversationId)
    ?.messages.find((m) => m.id === a.messageId);
  if (m) {
    m.status = approve ? "completed" : "cancelled";
    const output = approve
      ? a.action.includes("ticket")
        ? `Support ticket GB-${get().activity.length + 1042} created in the simulation.`
        : "Email sent in the simulation. No real email was delivered."
      : "You rejected this action. Nothing was sent or created.";
    m.content += "\n\n**" + output + "**";
    const call: ToolCall = {
      id: uid(),
      connectionId: a.connectionId,
      toolId: a.toolId,
      label: a.action,
      input: a.inputs.subject,
      status: approve ? "completed" : "cancelled",
      startedAt: stamp(),
      endedAt: stamp(),
      output,
      requiresApproval: true,
    };
    m.tools.push(call);
    log(a.conversationId, call);
  }
  persist();
  await delay(250);
}
