import test from "node:test";
import assert from "node:assert/strict";
import { demoStorage } from "../src/lib/demo-storage";
test("desktop Demo imports accessible legacy preferences once and explicit clearing cannot resurrect them", async () => {
  const legacy = new Map([
    ["gbot-workspace-v1", '{"state":{"color":"blue"},"version":1}'],
  ]);
  const native = new Map<string, string>();
  const priorWindow = Object.getOwnPropertyDescriptor(globalThis, "window");
  const priorStorage = Object.getOwnPropertyDescriptor(
    globalThis,
    "localStorage",
  );
  Object.defineProperty(globalThis, "localStorage", {
    configurable: true,
    value: {
      getItem: (key: string) => legacy.get(key) ?? null,
      removeItem: (key: string) => legacy.delete(key),
    },
  });
  Object.defineProperty(globalThis, "window", {
    configurable: true,
    value: {
      gbotDemo: {
        getItem: (key: string) => native.get(key) ?? null,
        setItem: async (key: string, value: string | null) => {
          if (value === null) native.delete(key);
          else native.set(key, value);
        },
      },
    },
  });
  try {
    assert.match(demoStorage.getItem("gbot-workspace-v1")!, /blue/);
    await Promise.resolve();
    assert.equal(legacy.size, 0);
    assert.match(demoStorage.getItem("gbot-workspace-v1")!, /blue/);
    await demoStorage.removeItem("gbot-workspace-v1");
    assert.equal(demoStorage.getItem("gbot-workspace-v1"), null);
    await demoStorage.setItem(
      "gbot-workspace-v1",
      '{"state":{"color":"green"}}',
    );
    assert.match(demoStorage.getItem("gbot-workspace-v1")!, /green/);
  } finally {
    if (priorWindow) Object.defineProperty(globalThis, "window", priorWindow);
    else Reflect.deleteProperty(globalThis, "window");
    if (priorStorage)
      Object.defineProperty(globalThis, "localStorage", priorStorage);
    else Reflect.deleteProperty(globalThis, "localStorage");
  }
});
