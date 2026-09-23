import type { Services } from "../contracts";
import type { Calls, Operation } from "./protocol";
export const isDesktop = () => typeof window !== "undefined" && !!window.gbot;
export async function desktopCall<K extends Operation>(
  operation: K,
  ...args: Parameters<Calls[K]>
): Promise<Awaited<ReturnType<Calls[K]>>> {
  if (!window.gbot)
    throw new Error("Open the desktop application to use native integrations.");
  const result = await window.gbot.call(operation, args);
  if (!result.ok)
    throw new Error(`${result.error.message} (${result.error.code})`);
  return result.value;
}
export function desktopServices(): Services {
  const call = desktopCall;
  return {
    hydrate: () => {},
    subscribe: (listener) => window.gbot!.subscribe(listener),
    snapshot: () => call("snapshot"),
    auth: {
      login: (...a) => call("auth.login", ...a),
      signup: (...a) => call("auth.signup", ...a),
      logout: () => call("auth.logout"),
      resetPassword: (...a) => call("auth.resetPassword", ...a),
      demo: () => call("auth.demo"),
    },
    account: {
      get: () => call("account.get"),
      update: (...a) => call("account.update", ...a),
      clearHistory: () => call("account.clearHistory"),
      reset: () => call("account.reset"),
      preferences: (...a) => call("account.preferences", ...a),
    },
    entitlements: {
      get: () => call("entitlements.get"),
      change: (...a) => call("entitlements.change", ...a),
      expire: (...a) => call("entitlements.expire", ...a),
    },
    providers: {
      list: () => call("providers.list"),
      test: (...a) => call("providers.test", ...a),
      save: (...a) => call("providers.save", ...a),
      testSaved: (...a) => call("providers.testSaved", ...a),
      remove: (...a) => call("providers.remove", ...a),
    },
    connections: {
      list: () => call("connections.list"),
      save: (...a) => call("connections.save", ...a),
      connect: (...a) => call("connections.connect", ...a),
      disconnect: (...a) => call("connections.disconnect", ...a),
      remove: (...a) => call("connections.remove", ...a),
      records: (...a) => call("connections.records", ...a),
    },
    tools: { toggle: (...a) => call("tools.toggle", ...a) },
    conversations: {
      list: () => call("conversations.list"),
      create: (...a) => call("conversations.create", ...a),
      rename: (...a) => call("conversations.rename", ...a),
      remove: (...a) => call("conversations.remove", ...a),
      feedback: (...a) => call("conversations.feedback", ...a),
    },
    execution: {
      run: (...a) => call("execution.run", ...a),
      stop: (id) => {
        void call("execution.stop", id).catch(() => {});
      },
      retry: (...a) => call("execution.retry", ...a),
    },
    approvals: { resolve: (...a) => call("approvals.resolve", ...a) },
    activity: { list: () => call("activity.list") },
    attachments: {
      process: async (file) => {
        if (file.size > 10 * 1024 * 1024)
          throw new Error("Maximum file size is 10 MB.");
        return call("attachments.process", {
          name: file.name,
          type: file.type,
          bytes: Array.from(new Uint8Array(await file.arrayBuffer())),
        });
      },
      url: (...a) => call("attachments.url", ...a),
    },
    secureStorage: {
      clear: () => call("secureStorage.clear"),
      status: () => call("secureStorage.status"),
    },
    updates: {
      check: () => call("updates.check"),
      download: () => call("updates.download"),
    },
    diagnostics: { set: (...a) => call("diagnostics.set", ...a) },
  };
}
