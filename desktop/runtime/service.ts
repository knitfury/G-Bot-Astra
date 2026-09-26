import { retainActivity } from "../../src/lib/audit";
import { validateRouter } from "../../src/lib/providers";
import type { ProductionIdentity } from "./identity";
import { Snapshots } from "./snapshots";
import { randomUUID } from "node:crypto";
import type { Services } from "../../src/services/contracts";
import type {
  Database,
  ProviderInput,
  MCPConnection,
} from "../../src/types/domain";
import { initialDatabase } from "../../src/data/mocks/seed";
import { entitlementFor, canActivate, reconcileConnections } from "../../src/lib/entitlements";
import { AtomicStore, SecretVault } from "./storage";
import { DomainError, safeError } from "./errors";
import { remoteURL, parseHeaders } from "./security";
import { Orchestrator } from "./orchestrator";
import { Attachments } from "./attachments";
import type { Inference } from "../adapters/providers";
import type { MCPRuntime } from "../adapters/mcp";
const stamp = () => new Date().toISOString();
export function localDatabase(): Database {
  const db = initialDatabase();
  db.records = [];
  db.runtime = {
    mode: "desktop",
    version: "0.2.0",
    notice:
      "Your AI and connected apps receive requests directly. Review permissions before sharing business data.",
  };
  return db;
}
export function databaseShape(value: unknown): value is Database {
  const obj = (v: unknown): v is Record<string, unknown> =>
    !!v && typeof v === "object" && !Array.isArray(v);
  const strings = (v: unknown, keys: string[]) =>
    obj(v) && keys.every((k) => typeof v[k] === "string");
  const array = (v: unknown, check: (item: unknown) => boolean): boolean =>
    Array.isArray(v) && v.every(check);
  const tool = (v: unknown) =>
    strings(v, ["id", "connectionId", "name", "label", "description"]) &&
    obj(v) &&
    typeof v.enabled === "boolean" &&
    typeof v.requiresApproval === "boolean" &&
    ["read", "write", "destructive"].includes(String(v.risk));
  const message = (v: unknown) =>
    strings(v, ["id", "role", "content", "createdAt", "model", "status"]) &&
    obj(v) &&
    array(v.attachments, (a) =>
      strings(a, ["id", "kind", "name", "mime", "status"]),
    ) &&
    array(v.tools, (t) =>
      strings(t, [
        "id",
        "connectionId",
        "toolId",
        "label",
        "input",
        "status",
        "output",
        "startedAt",
      ]),
    );
  if (!obj(value)) return false;
  const d = value;
  return (
    d.schema === 1 &&
    Number.isInteger(d.revision) &&
    (d.user === null ||
      strings(d.user, [
        "id",
        "name",
        "email",
        "avatar",
        "status",
        "createdAt",
      ])) &&
    obj(d.entitlement) &&
    ["free", "starter", "business"].includes(String(d.entitlement.plan)) &&
    typeof d.entitlement.maxActiveConnections === "number" &&
    obj(d.entitlement.flags) &&
    array(
      d.providers,
      (p) =>
        strings(p, [
          "id",
          "name",
          "type",
          "baseUrl",
          "model",
          "headers",
          "method",
          "auth",
          "body",
          "inputPath",
          "responsePath",
          "status",
          "maskedCredential",
          "createdAt",
          "updatedAt",
          "lastTest",
        ]) &&
        obj(p) &&
        typeof p.tools === "boolean" &&
        array(
          p.models,
          (m) =>
            strings(m, ["id", "providerId", "identifier", "name"]) &&
            obj(m) &&
            Array.isArray(m.capabilities) &&
            typeof m.enabled === "boolean",
        ),
    ) &&
    array(
      d.connections,
      (c) =>
        strings(c, [
          "id",
          "name",
          "category",
          "icon",
          "url",
          "auth",
          "status",
          "lastConnected",
          "error",
          "permissionSummary",
          "maskedCredential",
        ]) &&
        obj(c) &&
        Number.isInteger(c.slot) &&
        Number(c.slot) >= 0 &&
        Number.isSafeInteger(c.slot) &&
        typeof c.enabled === "boolean" &&
        array(c.tools, tool),
    ) &&
    array(
      d.conversations,
      (c) =>
        strings(c, ["id", "title", "createdAt", "updatedAt", "model"]) &&
        obj(c) &&
        array(c.messages, message),
    ) &&
    array(
      d.approvals,
      (a) =>
        strings(a, [
          "id",
          "conversationId",
          "messageId",
          "connectionId",
          "toolId",
          "action",
          "consequence",
          "status",
          "createdAt",
        ]) &&
        obj(a) &&
        strings(a.inputs, ["recipient", "subject", "body"]),
    ) &&
    array(d.activity, (a) =>
      strings(a, [
        "id",
        "timestamp",
        "actor",
        "conversationId",
        "connectionId",
        "tool",
        "action",
        "outcome",
        "detail",
      ]),
    ) &&
    Array.isArray(d.records) &&
    obj(d.preferences) &&
    ["startup", "notifications", "activityVisible"].every(
      (k) => typeof (d.preferences as Record<string, unknown>)[k] === "boolean",
    ) &&
    obj(d.diagnostics) &&
    typeof d.updateStatus === "string"
  );
}
export class Runtime {
  db: Database = localDatabase();
  readonly attachments = new Attachments();
  readonly engine: Orchestrator;
  readonly snapshots: Snapshots;
  private listeners = new Set<() => void>();
  readonly services: Services;
  constructor(
    private store: AtomicStore<Database>,
    readonly vault: SecretVault,
    private inference: Inference,
    readonly mcp: MCPRuntime,
    private updates: { check(): Promise<void>; download(): Promise<void> },
    private identity?: ProductionIdentity,
  ) {
    this.snapshots = new Snapshots(id=>this.db.connections.find(c=>c.id===id),()=>this.db.entitlement,mcp,(id,action,outcome)=>this.event(id,action,outcome));
    this.engine = new Orchestrator(
      () => this.db,
      () => this.save(),
      () => this.notify(),
      inference,
      mcp,
      (m) => this.provider(m),
      (a) => this.attachments.context(a),
    );
    const find = (id: string) => {
      const c = this.db.connections.find((c) => c.id === id);
      if (!c)
        throw new DomainError("INVALID_ARGUMENTS", "Connection not found.");
      return c;
    };
    const profile = async (name: string, email: string) => {
      this.db.user = {
        id: randomUUID(),
        name,
        email,
        avatar: "",
        status: "active",
        createdAt: stamp(),
      };
      await this.save();
      return this.db.user;
    };
    this.services = {
      hydrate: () => {},
      subscribe: (fn) => {
        this.listeners.add(fn);
        return () => {
          this.listeners.delete(fn);
        };
      },
      snapshot: async () => structuredClone(this.db),
      auth: {
        login: (email,password) => identity ? identity.login(email,password) : profile(email.split("@")[0], email),
        signup: (name, email,password) => identity ? identity.signup(name,email,password) : profile(name, email),
        resetPassword: async (email) => {
          if(identity)return identity.reset(email);
          throw new DomainError(
            "CAPABILITY",
            "Local profiles do not have a cloud password. Cloud identity is not configured.",
          );
        },
        demo: async () => {
          if(identity)throw new DomainError("CAPABILITY","Open the separate Demo workspace to explore simulated data.");
          await profile("Local workspace", "");
        },
        logout: async () => {
          this.engine.stopAll();
          if(identity)await identity.logout();
          else await this.services.secureStorage.clear();
          this.db.user = null;
          await this.save();
        },
      },
      account: {
        get: async () => this.db.user,
        update: async (name) => {
          if (this.db.user) this.db.user.name = name;
          await this.save();
        },
        clearHistory: async () => {
          this.engine.stopAll();
          this.attachments.clear();
          this.snapshots.clear();
          this.db.conversations = [];
          this.db.approvals = [];
          this.db.activity = [];
          await this.save();
        },
        reset: async () => {
          if(identity)throw new DomainError("CAPABILITY","Use local data controls to erase selected data. Demo reset is available only in Demo Mode.");
          this.engine.stopAll();
          await this.services.secureStorage.clear();
          this.db = localDatabase();
          await this.save();
        },
        preferences: async (values) => {
          Object.assign(this.db.preferences, values);
          await this.save();
        },
      },
      entitlements: {
        get: async () => this.db.entitlement,
        change: async (plan) => {
          if(identity)throw new DomainError("ENTITLEMENT","Manage your subscription in your account. Plan changes are confirmed securely after billing.");
          this.db.entitlement = entitlementFor(plan);
          this.event("", "Development plan changed", "completed");
          await this.save();
        },
        expire: async (expired) => {
          if(identity)throw new DomainError("ENTITLEMENT","Simulation cannot change your account entitlement.");
          this.db.entitlement.status = expired ? "expired" : "active";
          await this.save();
        },
      },
      providers: {
        list: async () => this.db.providers,
        test: async (input) => {
          await this.testProvider(input);
          return [input.model];
        },
        save: async (input, id) => {
          const prior = this.db.providers.find((p) => p.id === id);
          const providerId = id ?? randomUUID();
          if (prior && prior.baseUrl !== input.baseUrl && !input.key)
            throw new DomainError(
              "PROVIDER_AUTH",
              "Enter a credential again when changing the provider endpoint.",
            );
          const resolved = await this.withCredential(input, prior?.id);
          await this.testProvider(resolved);
          await vault.set(
            `${providerId}:provider`,
            JSON.stringify({ key: resolved.key, headers: resolved.headers }),
          );
          const { key, ...config } = input;
          void key;
          this.db.providers = this.db.providers.filter(
            (p) => p.id !== providerId,
          );
          this.db.providers.push({
            ...config,
            headers: "{}",
            id: providerId,
            status: "connected",
            maskedCredential:
              resolved.auth === "None"
                ? "No credential"
                : "Protected by your OS ••••",
            createdAt: prior?.createdAt ?? stamp(),
            updatedAt: stamp(),
            lastTest: stamp(),
            models: [
              {
                id: `${providerId}-0`,
                providerId,
                identifier: input.model,
                name: input.model,
                capabilities:
                  input.tools && input.type !== "Generic REST"
                    ? ["text", "tools"]
                    : ["text"],
                context: 0,
                enabled: true,
                default: true,
              },
            ],
          });
          this.event("", "AI provider connected", "completed");
          await this.save();
        },
        testSaved: async (id) => {
          const p = this.db.providers.find((p) => p.id === id);
          if (!p)
            throw new DomainError("INVALID_ARGUMENTS", "Provider not found.");
          try {
            await this.testProvider(
              await this.withCredential({ ...p, key: "" }, id),
            );
            p.status = "connected";
            p.lastTest = stamp();
          } catch (e) {
            p.status = "error";
            throw e;
          } finally {
            await this.save();
          }
        },
        remove: async (id) => {
          await vault.delete(`${id}:provider`);
          this.db.providers = this.db.providers.filter((p) => p.id !== id);
          await this.save();
        },
      },
      connections: {
        snapshot: (id,refresh) => this.snapshots.get(id,refresh),
        list: async () => this.db.connections,
        save: async (input, id) => {
          remoteURL(input.url);
          const cid = id ?? randomUUID(),
            prior = this.db.connections.find((c) => c.id === cid);
          if (prior) await mcp.disconnect(cid);
          if (
            prior &&
            (prior.url !== input.url ||
              prior.auth !== input.auth ||
              prior.oauthClientId !== input.oauthClientId)
          )
            for (const suffix of ["manual", "oauth-tokens", "oauth-client"])
              await vault.delete(`${cid}:${suffix}`);
          const existing = await vault.get(`${cid}:manual`);
          const headers = {
            ...(existing
              ? (JSON.parse(existing) as Record<string, string>)
              : {}),
            ...parseHeaders(input.headers ?? "{}"),
          };
          if (input.auth === "Token") {
            if (!input.token && !vault.has(`${cid}:manual`))
              throw new DomainError("MCP_AUTH", "Enter a token or API key.");
            if (input.token) {
              const name = input.authHeader || "Authorization";
              Object.assign(
                headers,
                parseHeaders(
                  JSON.stringify({
                    [name]:
                      name.toLowerCase() === "authorization"
                        ? `Bearer ${input.token}`
                        : input.token,
                  }),
                ),
              );
            }
          }
          if (input.token || Object.keys(headers).length)
            await vault.set(`${cid}:manual`, JSON.stringify(headers));
          const unchanged =
            prior?.url === input.url && prior.auth === input.auth;
          this.db.connections = this.db.connections.filter((c) => c.id !== cid);
          this.db.connections.push({
            id: cid,
            slot: input.slot,
            name: input.name,
            url: input.url,
            auth: input.auth,
            authHeader: input.authHeader,
            oauthClientId: input.oauthClientId,
            category: input.category,
            icon: input.category,
            status: "disconnected",
            enabled: false,
            tools: unchanged ? prior.tools : [],
            lastConnected: "",
            error: "",
            permissionSummary:
              "New or changed tools are disabled until you review and enable them.",
            maskedCredential:
              input.auth === "None" ? "No credential" : "Protected credential",
          });
          await this.save();
          return cid;
        },
        connect: async (id, consent) => {
          const c = find(id);
          if (!consent)
            throw new DomainError(
              "INVALID_ARGUMENTS",
              "Consent is required to discover tools.",
            );
          if (!canActivate(this.db.entitlement, this.db.connections, id))
            throw new DomainError(
              "ENTITLEMENT",
              "Your active connection allowance is full. Disconnect another connection or compare plans.",
            );
          if (["connecting", "authenticating"].includes(c.status))
            throw new DomainError(
              "MCP_PROTOCOL",
              "Connection is already in progress.",
            );
          c.enabled = true; // Reserve capacity before any asynchronous work.
          c.status = "connecting";
          c.error = "";
          await this.save();
          try {
            const tools = await mcp.connect(c);
            if (!c.enabled || !canActivate(this.db.entitlement, this.db.connections, id)) {
              await mcp.disconnect(id);
              throw new DomainError("ENTITLEMENT", "Connection activation was cancelled or the plan changed.");
            }
            c.tools = tools;
            c.status = "connected";
            c.enabled = true;
            c.lastConnected = stamp();
            this.event(
              id,
              "MCP tools discovered; review permissions",
              "completed",
            );
          } catch (e) {
            const error = safeError(e);
            c.status =
              error.code === "MCP_AUTH" ? "needs authentication" : "error";
            c.enabled = false;
            c.error = error.message;
            this.event(id, "MCP connection failed", "failed");
            throw error;
          } finally {
            await this.save();
          }
        },
        disconnect: async (id) => {
          const c = find(id);
          c.enabled = false;
          await mcp.disconnect(id);
          c.status = "disconnected";
          c.enabled = false;
          this.event(id, "MCP disconnected; configuration retained", "completed");
          await this.save();
        },
        remove: async (id) => {
          await this.services.connections.disconnect(id);
          for (const suffix of ["manual", "oauth-tokens", "oauth-client"]) await vault.delete(`${id}:${suffix}`);
          this.db.connections = this.db.connections.filter((c) => c.id !== id);
          await this.save();
        },
        records: async (category) =>
          this.db.connections
            .filter((c) => c.category === category)
            .flatMap((c) =>
              c.tools.map((t) => ({
                id: t.id,
                category,
                customer: c.name,
                company: "Remote MCP",
                title: t.label,
                subtitle: t.enabled ? "Tool enabled" : "Permission disabled",
                body: t.description,
                metadata: {
                  Connection: c.name,
                  Access: t.requiresApproval
                    ? "Approval before changes"
                    : "Read only",
                  Status: c.status,
                },
                status: t.enabled ? "Enabled" : "Disabled",
              })),
            ),
      },
      tools: {
        selectAll: async (cid, enabled) => {
          const c=find(cid); const previous=c.tools.map(t=>t.enabled);
          c.tools.forEach(t=>{t.enabled=enabled;});
          try {await this.save();this.snapshots.clear();} catch(e){c.tools.forEach((t,i)=>{t.enabled=previous[i];});throw e;}
        },
        toggle: async (cid, tid, enabled) => {
          const c = find(cid),
            t = c.tools.find((t) => t.id === tid);
          if (!t)
            throw new DomainError(
              "TOOL_UNAVAILABLE",
              "Tool not found. Refresh discovery.",
            );
          t.enabled = enabled;
          this.event(
            cid,
            enabled ? "Tool permission enabled" : "Tool permission disabled",
            "completed",
          );
          await this.save();
        },
      },
      conversations: {
        list: async () => this.db.conversations,
        create: async (model) => {
          const id = randomUUID();
          this.db.conversations.unshift({
            id,
            title: "New conversation",
            createdAt: stamp(),
            updatedAt: stamp(),
            model,
            messages: [],
          });
          await this.save();
          return id;
        },
        rename: async (id, title) => {
          const c = this.db.conversations.find((c) => c.id === id);
          if (c) c.title = title;
          await this.save();
        },
        remove: async (id) => {
          this.engine.stop(id);
          const removed=this.db.conversations.find(c=>c.id===id);
          for(const message of removed?.messages??[])for(const attachment of message.attachments??[])this.attachments.remove(attachment.id);
          this.db.conversations = this.db.conversations.filter(
            (c) => c.id !== id,
          );
          this.db.approvals = this.db.approvals.filter(
            (a) => a.conversationId !== id,
          );
          await this.save();
        },
        feedback: async (cid, mid, value) => {
          const m = this.db.conversations
            .find((c) => c.id === cid)
            ?.messages.find((m) => m.id === mid);
          if (m) m.feedback = value;
          await this.save();
        },
      },
      execution: {
        run: (...args) => this.engine.run(...args),
        stop: (id) => this.engine.stop(id),
        retry: (id) => this.engine.retry(id),
      },
      approvals: { resolve: (...args) => this.engine.resolve(...args) },
      activity: { list: async () => this.db.activity },
      attachments: {
        process: async (file) =>
          this.attachments.ingestFile(
            file.name,
            file.type,
            new Uint8Array(await file.arrayBuffer()),
          ),
        url: async (url) => this.attachments.url(url),
      },
      secureStorage: {
        clear: async () => {
          this.engine.stopAll();
          for (const c of this.db.connections) {
            await mcp.disconnect(c.id);
            c.enabled = false;
            c.status = "disconnected";
            c.maskedCredential = "Credential removed";
          }
          for (const p of this.db.providers) {
            p.status = "disconnected";
            p.maskedCredential = "Credential removed";
          }
          await vault.deleteMatching(id=>/:provider$|:manual$|:oauth-tokens$|:oauth-client$/.test(id));
          await this.save();
        },
        status: async () =>
          "Credentials are encrypted using your operating system's secure storage. No credential-read operation is exposed to the renderer.",
      },
      updates,
      diagnostics: {
        set: async () => {
          throw new DomainError(
            "CAPABILITY",
            "Simulation controls are available in browser demo mode only.",
          );
        },
      },
    };
  }
  async restoreSession() {
    if (!this.identity || !this.db.user) return;
    try {
      const license = await this.identity.ensure(true);
      if (license.account !== this.db.user?.id)
        throw new Error("Account mismatch");
      this.db.entitlement = entitlementFor(license.plan);
      if (this.db.runtime) this.db.runtime.sessionNotice = undefined;
    } catch {
      this.db.user = null;
      this.db.entitlement.status = "expired";
      if (this.db.runtime)
        this.db.runtime.sessionNotice =
          "Your session could not be restored. Sign in again to continue. Your local data is retained.";
    }
    await this.save();
  }
  async init() {
    await this.vault.init();
    this.db = await this.store.read();
    this.db.runtime = {
      mode: "desktop",
      production: !!this.identity,
      version: "1.0.0",
      notice: this.store.recovery || localDatabase().runtime!.notice,
    };
    if(this.identity)this.db.entitlement.status="expired";
    for (const c of this.db.connections) {
      c.status = "disconnected";
      c.enabled = false;
    }
    for (const c of this.db.conversations)
      for (const m of c.messages)
        if (["running", "approval required"].includes(m.status)) {
          m.status = "cancelled";
          m.content +=
            "\n\nInterrupted by restart. Check external activity before repeating consequential actions.";
          for (const t of m.tools)
            if (t.status === "running") t.status = "failed";
        }
    for (const a of this.db.approvals) {
      if (a.status === "pending") a.status = "cancelled";
      if (a.executionState === "started") a.executionState = "uncertain";
    }
    await this.save();
  }
  notify() {
    for (const listener of this.listeners) listener();
  }
  async save() {
    const paused = reconcileConnections(this.db.entitlement, this.db.connections);
    for (const id of paused) await this.mcp.disconnect(id);
    if (paused.length) this.snapshots.clear();
    retainActivity(this.db);
    this.db.revision++;
    await this.store.write(this.db);
    this.notify();
  }
  event(
    connectionId: string,
    action: string,
    outcome: "completed" | "failed" | "running",
  ) {
    this.db.activity.unshift({
      id: randomUUID(),
      timestamp: stamp(),
      actor: "G-Bot",
      conversationId: "",
      connectionId,
      tool: "",
      action,
      outcome,
      approvalRequired: false,
      detail: "",
    });
  }
  async withCredential(
    input: ProviderInput,
    id?: string,
  ): Promise<ProviderInput> {
    const saved = id ? await this.vault.get(`${id}:provider`) : undefined;
    const secret = saved
      ? (JSON.parse(saved) as { key: string; headers: string })
      : undefined;
    return {
      ...input,
      key: input.key || secret?.key || "",
      headers:
        input.headers === "{}" && secret ? secret.headers : input.headers,
    };
  }
  async provider(model: string) {
    const p = this.db.providers.find(
      (p) =>
        p.status === "connected" &&
        p.models.some((m) => m.id === model && m.enabled),
    );
    if (!p)
      throw new DomainError(
        "PROVIDER_AUTH",
        "Select and test an AI provider first.",
      );
    validateRouter({ ...p, key: "" }, this.db.entitlement);
    return this.withCredential({ ...p, key: "" }, p.id);
  }
  private async testProvider(input: ProviderInput) {
    validateRouter(input, this.db.entitlement);
    remoteURL(input.baseUrl);
    parseHeaders(input.headers);
    if (input.auth !== "None" && !input.key)
      throw new DomainError("PROVIDER_AUTH", "Enter a provider credential.");
    await this.inference.generate(
      input,
      [{ role: "user", text: "Reply with OK." }],
      [],
      AbortSignal.timeout(30_000),
      () => {},
    );
  }
}
