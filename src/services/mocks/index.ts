import type { Services } from "@/services/contracts";
import type {
  AIProviderConnection,
  Attachment,
  ProviderInput,
} from "@/types/domain";
import {
  initialDatabase,
  demoConnections,
  demoProvider,
  toolsFor,
} from "@/data/mocks/seed";
import { entitlementFor, slotAvailable } from "@/lib/entitlements";
import { stamp, uid } from "@/lib/utils";
import {
  delay,
  get,
  hydrate,
  online,
  persist,
  replace,
  subscribe,
} from "./database";
import { execution, resolveApproval, stopAll } from "./orchestrator";
const findConnection = (id: string) => {
  const c = get().connections.find((c) => c.id === id);
  if (!c) throw new Error("Connection not found.");
  return c;
};
const validateProvider = (input: ProviderInput) => {
  if (!input.name.trim() || !input.model.trim())
    throw new Error("Connection name and model are required.");
  if (input.auth !== "None" && input.key.length < 8)
    throw new Error("Use a demo key with at least 8 characters.");
  if (input.baseUrl && !/^https?:\/\//.test(input.baseUrl))
    throw new Error("Enter a valid HTTP or HTTPS endpoint.");
  try {
    const headers = JSON.parse(input.headers || "{}");
    if (typeof headers !== "object" || Array.isArray(headers) || !headers)
      throw new Error();
    if (input.type === "Generic REST") {
      JSON.parse(input.body);
      if (!input.responsePath || !input.inputPath) throw new Error();
    }
  } catch {
    throw new Error(
      "Check your JSON headers, request body, and input/response mapping.",
    );
  }
  if (/invalid|bad-key/i.test(input.key) || get().diagnostics.providerFailure)
    throw new Error(
      "Provider authentication failed. Check the demo key and try again.",
    );
};
export const mockServices: Services = {
  hydrate,
  subscribe,
  snapshot: async () => {
    await delay(60);
    return structuredClone(get());
  },
  auth: {
    async login(email, password) {
      await online();
      if (get().diagnostics.authFailure === "network")
        throw new Error("Sign-in service unavailable. Please retry.");
      if (
        password.length < 8 ||
        email.startsWith("invalid@") ||
        get().diagnostics.authFailure === "credentials"
      )
        throw new Error("Email or password is incorrect.");
      const user = {
        id: uid(),
        name: email.split("@")[0],
        email,
        avatar: "",
        status: "active" as const,
        createdAt: stamp(),
      };
      get().user = user;
      persist();
      return user;
    },
    async signup(name, email, password) {
      const user = await mockServices.auth.login(email, password);
      user.name = name;
      get().user = user;
      persist();
      return user;
    },
    async logout() {
      stopAll();
      await mockServices.secureStorage.clear();
      get().user = null;
      persist();
    },
    async resetPassword(email) {
      await online();
      if (!email.includes("@")) throw new Error("Enter your email first.");
    },
    async demo() {
      await delay();
      const db = initialDatabase();
      db.user = {
        id: "demo-user",
        name: "Alex Morgan",
        email: "alex@studio.example",
        avatar: "",
        status: "active",
        createdAt: stamp(),
      };
      db.entitlement = entitlementFor("business");
      db.connections = demoConnections();
      db.providers = [demoProvider()];
      replace(db);
    },
  },
  account: {
    get: async () => {
      await delay();
      return get().user;
    },
    async update(name) {
      await delay();
      if (get().user) get().user!.name = name;
      persist();
    },
    async clearHistory() {
      stopAll();
      get().conversations = [];
      get().approvals = [];
      get().activity = [];
      persist();
    },
    async reset() {
      stopAll();
      replace(initialDatabase());
    },
    async preferences(values) {
      Object.assign(get().preferences, values);
      persist();
    },
  },
  entitlements: {
    get: async () => {
      await delay();
      return get().entitlement;
    },
    async change(plan) {
      await delay();
      get().entitlement = entitlementFor(plan);
      persist();
    },
    async expire(expired) {
      get().entitlement.status = expired ? "expired" : "active";
      persist();
    },
  },
  providers: {
    list: async () => {
      await delay();
      return get().providers;
    },
    async test(input) {
      await online();
      await delay(450);
      validateProvider(input);
      return [input.model, `${input.model}-fast`];
    },
    async save(input, id) {
      await mockServices.providers.test(input);
      const existing = get().providers.find((p) => p.id === id);
      const providerId = id || uid();
      const { key, ...safe } = input;
      void key;
      const provider: AIProviderConnection = {
        ...safe,
        headers: "{}",
        id: providerId,
        status: "connected",
        maskedCredential:
          input.auth === "None" ? "No credential" : "Demo credential ••••",
        createdAt: existing?.createdAt || stamp(),
        updatedAt: stamp(),
        lastTest: stamp(),
        models: [input.model, `${input.model}-fast`].map((m, i) => ({
          id: `${providerId}-${i}`,
          providerId,
          identifier: m,
          name: m,
          enabled: true,
          default: !i,
          capabilities: input.tools ? ["text", "tools", "images"] : ["text"],
          context: 128000,
        })),
      };
      get().providers = [
        ...get().providers.filter((p) => p.id !== id),
        provider,
      ];
      persist();
    },
    async testSaved(id) {
      await online();
      const p = get().providers.find((p) => p.id === id);
      if (!p) throw new Error("Provider not found.");
      p.lastTest = stamp();
      p.status = get().diagnostics.providerFailure ? "error" : "connected";
      persist();
      if (p.status === "error")
        throw new Error(
          "Provider authentication failed. Edit the provider to reconnect.",
        );
    },
    async remove(id) {
      await delay();
      get().providers = get().providers.filter((p) => p.id !== id);
      persist();
    },
  },
  connections: {
    list: async () => {
      await delay();
      return get().connections;
    },
    async save(input, id) {
      await online();
      if (!slotAvailable(get().entitlement, input.slot))
        throw new Error("This slot is unavailable on your current plan.");
      if (!input.name.trim() || !/^https?:\/\//.test(input.url))
        throw new Error("Enter a connection name and valid HTTP(S) MCP URL.");
      const existing = get().connections.find((c) => c.id === id);
      if (!id && get().connections.some((c) => c.slot === input.slot))
        throw new Error("This slot is already configured.");
      const connectionId = id || uid();
      get().connections = [
        ...get().connections.filter((c) => c.id !== id),
        {
          ...input,
          id: connectionId,
          icon: input.category,
          status:
            input.auth === "OAuth" ? "needs authentication" : "disconnected",
          enabled: false,
          tools: existing?.category === input.category ? existing.tools : [],
          lastConnected: existing?.lastConnected || "",
          error: "",
          permissionSummary: `Read ${input.category.toLowerCase()} information. Writes require your approval.`,
          maskedCredential: "Not authenticated",
        },
      ];
      persist();
      return connectionId;
    },
    async connect(id, consent) {
      const c = findConnection(id);
      if (!consent) throw new Error("Permission approval is required.");
      if (!slotAvailable(get().entitlement, c.slot))
        throw new Error("Your plan does not allow this connection.");
      c.status = "connecting";
      c.error = "";
      persist();
      try {
        await online();
        await delay(650);
        if (
          (c.auth === "OAuth" && get().diagnostics.oauthFailure) ||
          c.url.includes("fail")
        )
          throw new Error(
            "Connection failed. Check the endpoint or retry authentication.",
          );
        c.tools = get().diagnostics.noTools
          ? []
          : c.tools.length
            ? c.tools
            : toolsFor(id, c.category);
        c.status = "connected";
        c.enabled = true;
        c.lastConnected = stamp();
        c.maskedCredential = "Demo credential ••••";
      } catch (error) {
        c.status = "error";
        c.enabled = false;
        c.error = error instanceof Error ? error.message : "Connection failed.";
        throw error;
      } finally {
        persist();
      }
    },
    async disconnect(id) {
      await delay();
      const c = findConnection(id);
      c.status = "disconnected";
      c.enabled = false;
      persist();
    },
    async remove(id) {
      await delay();
      get().connections = get().connections.filter((c) => c.id !== id);
      persist();
    },
    async snapshot(id) {
      const c=findConnection(id); return {connectionId:id,kind:null,state:"unknown",items:[],refreshedAt:null,message:c.name,sourceTools:[]};
    },
    async records(category) {
      await delay(250);
      return get().records.filter((r) => r.category === category);
    },
  },
  tools: {
    async selectAll(cid,enabled) { findConnection(cid).tools.forEach(t=>{t.enabled=enabled;});persist(); },
    async toggle(cid, tid, enabled) {
      await delay();
      const tool = findConnection(cid).tools.find((t) => t.id === tid);
      if (tool) tool.enabled = enabled;
      persist();
    },
  },
  conversations: {
    list: async () => {
      await delay();
      return get().conversations;
    },
    async create(model) {
      const id = uid();
      get().conversations.unshift({
        id,
        title: "New conversation",
        createdAt: stamp(),
        updatedAt: stamp(),
        model,
        messages: [],
      });
      persist();
      return id;
    },
    async rename(id, title) {
      const c = get().conversations.find((c) => c.id === id);
      if (c) c.title = title.trim() || "Untitled conversation";
      persist();
    },
    async remove(id) {
      execution.stop(id);
      get().conversations = get().conversations.filter((c) => c.id !== id);
      get().approvals = get().approvals.filter((a) => a.conversationId !== id);
      persist();
    },
    async feedback(cid, mid, value) {
      const m = get()
        .conversations.find((c) => c.id === cid)
        ?.messages.find((m) => m.id === mid);
      if (m) m.feedback = value;
      persist();
    },
  },
  execution,
  approvals: { resolve: resolveApproval },
  activity: {
    list: async () => {
      await delay();
      return get().activity;
    },
  },
  attachments: {
    async process(file) {
      const a: Attachment = {
        id: uid(),
        kind: file.type.startsWith("image/") ? "image" : "file",
        name: file.name,
        size: file.size,
        mime: file.type,
        status: "ready",
      };
      await delay(500);
      if (file.size > 10 * 1024 * 1024) {
        a.status = "failed";
        a.error = "Maximum file size is 10 MB.";
      } else if (!/\.(pdf|txt|csv|md|docx|png|jpe?g|webp)$/i.test(file.name)) {
        a.status = "unsupported";
        a.error = "Use PDF, text, CSV, DOCX, PNG, JPG or WebP.";
      } else if (file.name.includes("fail")) {
        a.status = "failed";
        a.error = "Demo processing failed. Remove and attach again.";
      } else if (a.kind === "image" && file.size < 2 * 1024 * 1024) {
        a.preview = await new Promise<string>((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => resolve(String(reader.result));
          reader.onerror = reject;
          reader.readAsDataURL(file);
        });
      }
      return a;
    },
    async url(url) {
      await delay();
      let parsed: URL;
      try {
        parsed = new URL(url);
        if (!["http:", "https:"].includes(parsed.protocol)) throw new Error();
      } catch {
        throw new Error("Enter a valid HTTP or HTTPS URL.");
      }
      return {
        id: uid(),
        kind: "URL",
        name: parsed.hostname,
        url: parsed.href,
        size: 0,
        mime: "text/html",
        status: "ready",
      };
    },
  },
  secureStorage: {
    async clear() {
      get().providers = get().providers.map((p) => ({
        ...p,
        status: "disconnected",
        maskedCredential: "Credential removed",
      }));
      get().connections = get().connections.map((c) => ({
        ...c,
        status: "disconnected",
        enabled: false,
        maskedCredential: "Credential removed",
      }));
      persist();
    },
    async status() {
      return "Simulation only. Keys are discarded after testing; no native encrypted storage is implemented.";
    },
  },
  updates: {
    async check() {
      await online();
      get().updateStatus = "available";
      persist();
    },
    async download() {
      get().updateStatus = "downloading";
      persist();
      await delay(1600);
      get().updateStatus = "restart required";
      persist();
    },
  },
  diagnostics: {
    async set(input) {
      Object.assign(get().diagnostics, input);
      persist();
    },
  },
};
